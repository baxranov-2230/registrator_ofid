from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy import select
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
    decode_token,
    end_session,
    get_current_user,
    is_refresh_jti_valid,
    is_session_active,
    new_session_id,
    record_login_failure,
    register_refresh_jti,
    revoke_refresh_jti,
    touch_session,
)
from app.core.security import create_refresh_token as _create_refresh_token
from app.models import User
from app.schemas.auth import (
    HemisLoginRequest,
    HemisTokenRequest,
    LoginRequest,
    RefreshRequest,
    TokenPair,
)
from app.schemas.user import UserOut
from app.services.audit_service import log_action
from app.services.auth_service import (
    AuthError,
    authenticate_local,
    authenticate_student_by_hemis_token,
    authenticate_student_hemis,
    issue_tokens,
)

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


@router.post("/login", response_model=TokenPair)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    identity = data.email.lower()
    ip = client_ip(request)
    await check_brute_force(redis, identity=identity, ip=ip)
    try:
        user = await authenticate_local(db, email=data.email, password=data.password)
    except AuthError as exc:
        await record_login_failure(redis, identity=identity, ip=ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await clear_login_failures(redis, identity=identity, ip=ip)
    access, refresh = await issue_tokens(redis, user)
    await log_action(
        db,
        user_id=user.id,
        action="login",
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    _set_refresh_cookie(response, refresh)
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/login/hemis", response_model=TokenPair)
async def login_hemis(
    data: HemisLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    identity = f"hemis:{data.username.lower()}"
    ip = client_ip(request)
    await check_brute_force(redis, identity=identity, ip=ip)
    try:
        user = await authenticate_student_hemis(db, username=data.username, password=data.password)
    except AuthError as exc:
        await record_login_failure(redis, identity=identity, ip=ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await clear_login_failures(redis, identity=identity, ip=ip)
    access, refresh = await issue_tokens(redis, user)
    await log_action(
        db,
        user_id=user.id,
        action="login_hemis",
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    _set_refresh_cookie(response, refresh)
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/hemis/exchange", response_model=TokenPair)
async def hemis_exchange(
    data: HemisTokenRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    """Exchange an already-obtained HEMIS token for a local JWT pair.

    Flow: frontend calls HEMIS /auth/login directly and gets a token.
    It then posts that token here; the backend validates it via HEMIS /me,
    syncs the local user row, and issues local access + refresh tokens.
    """
    try:
        user = await authenticate_student_by_hemis_token(db, data.hemis_token)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    access, refresh = await issue_tokens(redis, user)
    await log_action(
        db,
        user_id=user.id,
        action="login_hemis_token",
        entity_type="user",
        entity_id=user.id,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    _set_refresh_cookie(response, refresh)
    return TokenPair(access_token=access, refresh_token=refresh)


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
