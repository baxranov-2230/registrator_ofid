import hashlib
import secrets

import segno
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_redis_dep
from app.core.config import settings
from app.core.db import get_db
from app.core.security import (
    check_brute_force,
    clear_login_failures,
    client_ip,
    create_access_token,
    create_mfa_token,
    decode_token,
    end_session,
    get_current_user,
    hash_password,
    is_refresh_jti_valid,
    is_session_active,
    new_session_id,
    record_login_failure,
    register_refresh_jti,
    revoke_all_refresh_tokens,
    revoke_refresh_jti,
    touch_session,
    verify_password,
)
from app.core.security import create_refresh_token as _create_refresh_token
from app.core.totp import matching_step, new_secret, provisioning_uri
from app.models import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MfaLoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenPair,
    TotpCodeRequest,
    TotpDisableRequest,
    TotpSetupOut,
)
from app.schemas.user import UserOut
from app.services.audit_service import log_action
from app.services.auth_service import (
    AuthError,
    authenticate_local,
    issue_tokens,
)
from app.services.email_templates import render
from app.services.outbox_service import enqueue_email

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Store the refresh token in an httpOnly cookie.

    httpOnly keeps it out of reach of any script, so an XSS cannot lift a
    long-lived credential. The path is scoped to /api/v1/auth so it is only
    ever sent to the endpoints that actually need it.
    """
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        max_age=settings.jwt_refresh_ttl_days * 24 * 3600,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,
        path=settings.refresh_cookie_path,
        domain=settings.refresh_cookie_domain or None,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        domain=settings.refresh_cookie_domain or None,
    )


def _expired_cookie_header() -> dict[str, str]:
    """Set-Cookie header that clears the refresh cookie, for use on an error.

    Raising HTTPException discards the injected Response object, so a
    delete_cookie() call on it never reaches the client. Attaching the header
    to the exception is the only way to clear a dead cookie while still
    returning 401 — otherwise the browser keeps re-sending a token that can
    never work again.
    """
    carrier = Response()
    _clear_refresh_cookie(carrier)
    return {"set-cookie": carrier.headers["set-cookie"]}


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers=_expired_cookie_header(),
    )


def _refresh_token_from(data: RefreshRequest | None, cookie: str | None) -> str:
    """Prefer the cookie, fall back to the request body.

    The cookie is the secure path. The body is kept working for non-browser
    clients and for a browser session that logged in before cookies shipped.
    """
    token = cookie or (data.refresh_token if data else None)
    if not token:
        raise _unauthorized("Refresh token missing")
    return token


async def _complete_login(
    *,
    user: User,
    action: str,
    request: Request,
    response: Response,
    db: AsyncSession,
    redis: Redis,
) -> LoginResponse:
    access, refresh = await issue_tokens(redis, user)
    await log_action(
        db,
        user_id=user.id,
        action=action,
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    _set_refresh_cookie(response, refresh)
    return LoginResponse(access_token=access, refresh_token=refresh)


async def _consume_totp(redis: Redis, user: User, code: str) -> bool:
    """Check a code and burn it, so the same code cannot be replayed."""
    if not user.totp_secret:
        return False
    step = matching_step(user.totp_secret, code)
    if step is None:
        return False
    return bool(await redis.set(f"totp:used:{user.id}:{step}", "1", nx=True, ex=120))


@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> LoginResponse:
    identity = data.email.lower()
    ip = client_ip(request)
    await check_brute_force(redis, identity=identity, ip=ip)
    try:
        user = await authenticate_local(db, email=data.email, password=data.password)
    except AuthError as exc:
        await record_login_failure(redis, identity=identity, ip=ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await clear_login_failures(redis, identity=identity, ip=ip)
    if user.totp_enabled:
        # The password was right, but no session exists until the second
        # factor is shown too.
        await db.commit()
        return LoginResponse(mfa_required=True, mfa_token=create_mfa_token(user))
    return await _complete_login(
        user=user, action="login", request=request, response=response, db=db, redis=redis
    )


@router.post("/login/2fa", response_model=LoginResponse)
async def login_second_factor(
    data: MfaLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> LoginResponse:
    payload = decode_token(data.mfa_token)
    if payload.get("type") != "mfa":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    user = await db.get(User, int(payload.get("sub", 0)))
    if not user or not user.is_active or not user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Kirish rad etildi")

    # Six digits are guessable without a budget, so the code has one too.
    identity = f"mfa:{user.id}"
    ip = client_ip(request)
    await check_brute_force(redis, identity=identity, ip=ip)
    if not await _consume_totp(redis, user, data.code):
        await record_login_failure(redis, identity=identity, ip=ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Kod noto'g'ri")
    await clear_login_failures(redis, identity=identity, ip=ip)
    return await _complete_login(
        user=user, action="login_2fa", request=request, response=response, db=db, redis=redis
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    response: Response,
    data: RefreshRequest | None = None,
    royd_refresh: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    """Exchange a valid refresh token for a new access/refresh pair.

    This is what keeps a page reload from logging the user out: the access
    token lives only in memory, so on a fresh load the app calls here and gets
    a working pair back from the cookie alone.
    """
    token = _refresh_token_from(data, royd_refresh)
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise _unauthorized("Invalid token type")
    user_id = int(payload.get("sub", 0))
    jti = payload.get("jti")
    session_id = payload.get("sid") or ""
    if not user_id or not jti or not await is_refresh_jti_valid(redis, user_id, jti):
        raise _unauthorized("Refresh token invalid or revoked")

    # A refresh token that is still cryptographically valid is not enough: if
    # the session went quiet past the idle timeout, the session is over even
    # though the token has days left on it.
    if not await is_session_active(redis, session_id):
        await revoke_refresh_jti(redis, user_id, jti)
        raise _unauthorized("Session expired due to inactivity")

    stmt = select(User).where(User.id == user_id).options(selectinload(User.role))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not user.is_active:
        raise _unauthorized("User inactive")

    # Carry the session across the rotation so the idle window is continuous;
    # a pre-sid token adopts a new session here.
    session_id = session_id or new_session_id()
    await revoke_refresh_jti(redis, user_id, jti)
    new_refresh, new_jti = _create_refresh_token(user, session_id)
    await register_refresh_jti(redis, user.id, new_jti)
    await touch_session(redis, session_id)
    access = create_access_token(user, session_id)
    _set_refresh_cookie(response, new_refresh)
    return TokenPair(access_token=access, refresh_token=new_refresh)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    data: RefreshRequest | None = None,
    royd_refresh: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
    redis: Redis = Depends(get_redis_dep),
) -> None:
    # Always drop the cookie, even if the token turns out to be junk — a logout
    # must never leave a credential behind in the browser.
    _clear_refresh_cookie(response)
    token = royd_refresh or (data.refresh_token if data else None)
    if not token:
        return None
    try:
        payload = decode_token(token)
    except HTTPException:
        return None
    if payload.get("type") != "refresh":
        return None
    user_id = int(payload.get("sub", 0))
    jti = payload.get("jti")
    if user_id and jti:
        await revoke_refresh_jti(redis, user_id, jti)
    await end_session(redis, payload.get("sid") or "")
    return None


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


# ── Password management ─────────────────────────────────────────────────────

_RESET_PREFIX = "pwreset:"
_RESET_TTL_SECONDS = 30 * 60


def _reset_key(token: str) -> str:
    # Only a hash of the token is stored, so a Redis dump does not hand out
    # working reset links.
    return _RESET_PREFIX + hashlib.sha256(token.encode()).hexdigest()


@router.post("/change-password", response_model=TokenPair)
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
    user: User = Depends(get_current_user),
) -> TokenPair:
    """Staff change their own password; every other session is signed out."""
    if not user.password_hash:
        raise HTTPException(status_code=400, detail="Bu akkaunt parol bilan kirmaydi")
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Joriy parol noto'g'ri")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="Yangi parol eskisidan farq qilishi kerak")

    user.password_hash = hash_password(data.new_password)
    await log_action(
        db,
        user_id=user.id,
        action="user.password_change",
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip(request),
    )
    await db.commit()
    await revoke_all_refresh_tokens(redis, user.id)
    # The caller keeps working: a fresh pair replaces the revoked one.
    access, refresh = await issue_tokens(redis, user)
    _set_refresh_cookie(response, refresh)
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/password/forgot", status_code=204)
async def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> None:
    """Email a single-use reset link.

    Always answers 204, whether or not the address exists, so the endpoint
    cannot be used to discover which emails have accounts.
    """
    email = data.email.lower()
    ip = client_ip(request)
    # Three links per address per window is plenty for a human and stops the
    # endpoint from being used to flood someone's mailbox.
    identity = f"pwreset:{email}"
    await check_brute_force(redis, identity=identity, ip=ip)
    await record_login_failure(redis, identity=identity, ip=ip)

    user = (
        await db.execute(select(User).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    if not user or not user.is_active or not user.password_hash:
        return None

    token = secrets.token_urlsafe(32)
    await redis.setex(_reset_key(token), _RESET_TTL_SECONDS, str(user.id))
    link = f"{settings.public_base_url.rstrip('/')}/reset-password?token={token}"
    title = "ROYD: parolni tiklash"
    text, html = render(
        title,
        [
            "Parolingizni tiklash so'raldi. Yangi parol o'rnatish uchun quyidagi havolani oching.",
            "Havola 30 daqiqa amal qiladi va faqat bir marta ishlaydi.",
            "Agar buni siz so'ramagan bo'lsangiz, xabarni e'tiborsiz qoldiring.",
        ],
        link,
        link_label="Parolni tiklash",
    )
    await enqueue_email(db, user.email, title, text, html)
    await log_action(
        db,
        user_id=user.id,
        action="user.password_reset_requested",
        entity_type="user",
        entity_id=user.id,
        ip_address=ip,
    )
    await db.commit()
    return None


@router.post("/password/reset", status_code=204)
async def reset_password(
    data: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> None:
    key = _reset_key(data.token)
    user_id = await redis.get(key)
    if not user_id:
        raise HTTPException(status_code=400, detail="Havola yaroqsiz yoki muddati o'tgan")
    # Single use: burn the token before anything else can fail.
    await redis.delete(key)

    user = await db.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Havola yaroqsiz yoki muddati o'tgan")
    user.password_hash = hash_password(data.new_password)
    await log_action(
        db,
        user_id=user.id,
        action="user.password_reset",
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip(request),
    )
    await db.commit()
    await revoke_all_refresh_tokens(redis, user.id)
    return None


# ── Second factor (TOTP) ────────────────────────────────────────────────────


@router.post("/2fa/setup", response_model=TotpSetupOut)
async def totp_setup(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TotpSetupOut:
    """Start enrolment: a new secret, not yet enforced until confirmed."""
    if user.totp_enabled:
        raise HTTPException(status_code=409, detail="Ikki bosqichli kirish allaqachon yoqilgan")
    if not user.password_hash:
        raise HTTPException(status_code=400, detail="Bu akkaunt parol bilan kirmaydi")
    user.totp_secret = new_secret()
    await db.commit()
    uri = provisioning_uri(user.totp_secret, user.email or str(user.id), settings.totp_issuer)
    return TotpSetupOut(
        secret=user.totp_secret,
        otpauth_url=uri,
        qr_svg=segno.make(uri, error="m").svg_data_uri(scale=5),
    )


@router.post("/2fa/enable", status_code=204)
async def totp_enable(
    data: TotpCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
    user: User = Depends(get_current_user),
) -> None:
    if user.totp_enabled:
        raise HTTPException(status_code=409, detail="Ikki bosqichli kirish allaqachon yoqilgan")
    # Proving a code before enabling means a mistyped secret can never lock
    # the user out of their own account.
    if not await _consume_totp(redis, user, data.code):
        raise HTTPException(status_code=400, detail="Kod noto'g'ri")
    user.totp_enabled = True
    await log_action(
        db,
        user_id=user.id,
        action="user.2fa_enable",
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip(request),
    )
    await db.commit()
    return None


@router.post("/2fa/disable", status_code=204)
async def totp_disable(
    data: TotpDisableRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
    user: User = Depends(get_current_user),
) -> None:
    if not user.totp_enabled:
        raise HTTPException(status_code=409, detail="Ikki bosqichli kirish yoqilmagan")
    if not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Parol noto'g'ri")
    if not await _consume_totp(redis, user, data.code):
        raise HTTPException(status_code=400, detail="Kod noto'g'ri")
    user.totp_enabled = False
    user.totp_secret = None
    await log_action(
        db,
        user_id=user.id,
        action="user.2fa_disable",
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip(request),
    )
    await db.commit()
    return None
