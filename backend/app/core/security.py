import asyncio
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.openapi.models import OAuthFlows
from fastapi.security import OAuth2, OAuth2PasswordBearer, SecurityScopes
from fastapi.security.utils import get_authorization_scheme_param
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.db import get_db
from app.core.redis import get_redis
from app.models import ApiClient, User


async def _redis_dep() -> Redis:
    """Redis handle for the auth dependencies.

    Declared here rather than imported from app.api.deps so that app.core does
    not depend on app.api; app.api.deps.get_redis_dep wraps the same client.
    """
    return get_redis()


#: Reglament 10.1: bcrypt with at least 12 rounds.
BCRYPT_ROUNDS = 12
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
#: Separate scheme for external systems, so Swagger offers the client
#: credentials flow and lists each endpoint's required scopes.
client_oauth2_scheme = OAuth2(
    flows=OAuthFlows(
        clientCredentials={"tokenUrl": "/api/v1/oauth/token", "scopes": ApiClient.SCOPES}
    ),
    scheme_name="ApiClient",
    auto_error=False,
)

REFRESH_BLOCKLIST_PREFIX = "refresh:blocked:"
REFRESH_ACTIVE_PREFIX = "refresh:active:"
SESSION_SEEN_PREFIX = "session:seen:"


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    # Hashes written by passlib are standard $2b$ strings, so existing
    # passwords keep working after the switch to calling bcrypt directly.
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


def _create_token(
    subject: str,
    claims: dict[str, Any],
    ttl: timedelta,
    token_type: str,
) -> tuple[str, str]:
    jti = secrets.token_urlsafe(16)
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "exp": now + ttl,
        "iat": now,
        "jti": jti,
        "type": token_type,
        **claims,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti


def new_session_id() -> str:
    """Identifier for one login session, carried by every token it mints.

    Refresh tokens rotate on every use, so the jti cannot identify a session
    across refreshes. The sid is stable from login until logout, which is what
    the idle-timeout bookkeeping needs to key on.
    """
    return secrets.token_urlsafe(16)


def create_access_token(user: User, session_id: str) -> str:
    claims = {
        "role": user.role.name if user.role else None,
        "faculty_id": user.faculty_id,
        "full_name": user.full_name,
        "sid": session_id,
    }
    token, _ = _create_token(
        subject=str(user.id),
        claims=claims,
        ttl=timedelta(minutes=settings.jwt_access_ttl_minutes),
        token_type="access",
    )
    return token


def create_refresh_token(user: User, session_id: str) -> tuple[str, str]:
    token, jti = _create_token(
        subject=str(user.id),
        claims={"sid": session_id},
        ttl=timedelta(days=settings.jwt_refresh_ttl_days),
        token_type="refresh",
    )
    return token, jti


def create_mfa_token(user: User) -> str:
    """Proof that the password step succeeded, valid only for the 2FA step.

    Its own token type, so it can never be used as an access or refresh token.
    """
    token, _ = _create_token(
        subject=str(user.id), claims={}, ttl=timedelta(minutes=5), token_type="mfa"
    )
    return token


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def register_refresh_jti(redis: Redis, user_id: int, jti: str) -> None:
    ttl_seconds = settings.jwt_refresh_ttl_days * 24 * 3600
    await redis.setex(f"{REFRESH_ACTIVE_PREFIX}{user_id}:{jti}", ttl_seconds, "1")


async def revoke_refresh_jti(redis: Redis, user_id: int, jti: str) -> None:
    await redis.delete(f"{REFRESH_ACTIVE_PREFIX}{user_id}:{jti}")
    ttl_seconds = settings.jwt_refresh_ttl_days * 24 * 3600
    await redis.setex(f"{REFRESH_BLOCKLIST_PREFIX}{jti}", ttl_seconds, "1")


async def is_refresh_jti_valid(redis: Redis, user_id: int, jti: str) -> bool:
    if await redis.exists(f"{REFRESH_BLOCKLIST_PREFIX}{jti}"):
        return False
    return bool(await redis.exists(f"{REFRESH_ACTIVE_PREFIX}{user_id}:{jti}"))


async def touch_session(redis: Redis, session_id: str) -> None:
    """Mark a session as active right now.

    The key is a sliding window: its TTL is reset to the idle timeout on every
    touch, so the key simply ceases to exist once the user has been quiet for
    longer than the timeout. No timestamp arithmetic and no cleanup job.
    """
    if not session_id:
        return
    ttl = settings.session_idle_timeout_minutes * 60
    await redis.setex(f"{SESSION_SEEN_PREFIX}{session_id}", ttl, "1")


async def is_session_active(redis: Redis, session_id: str) -> bool:
    if not session_id:
        # Tokens minted before sid existed carry no session key. Treat them as
        # active so an in-flight session survives the deploy; they pick up a sid
        # on their next refresh.
        return True
    return bool(await redis.exists(f"{SESSION_SEEN_PREFIX}{session_id}"))


async def end_session(redis: Redis, session_id: str) -> None:
    if session_id:
        await redis.delete(f"{SESSION_SEEN_PREFIX}{session_id}")


async def revoke_all_refresh_tokens(redis: Redis, user_id: int) -> int:
    """Invalidate every refresh token a user holds, e.g. after a password change.

    Access tokens already issued stay valid for their few remaining minutes;
    none of them can be renewed.
    """
    keys = [key async for key in redis.scan_iter(match=f"{REFRESH_ACTIVE_PREFIX}{user_id}:*")]
    if keys:
        await redis.delete(*keys)
    return len(keys)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(_redis_dep),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    user_id = int(payload.get("sub", 0))
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    session_id = payload.get("sid") or ""
    if not await is_session_active(redis, session_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired due to inactivity",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = select(User).where(User.id == user_id).options(selectinload(User.role))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")

    # An authenticated API call is activity: slide the idle window forward.
    await touch_session(redis, session_id)
    return user


def require_roles(*role_names: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        if not user.has_role(*role_names):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ruxsat yetarli emas")
        return user

    return _check


# ── API clients (OAuth2 client_credentials) ─────────────────────────────────


def new_client_credentials() -> tuple[str, str]:
    """A fresh (client_id, client_secret) pair."""
    return f"royd_{secrets.token_hex(12)}", secrets.token_urlsafe(32)


def hash_client_secret(secret: str) -> str:
    """Digest of a client secret, for storage.

    Not bcrypt: the secret is 256 random bits, not a human password, so there
    is nothing for key stretching to protect — it would only add a quarter
    second to every token request.
    """
    return hashlib.sha256(secret.encode()).hexdigest()


def verify_client_secret(secret: str, secret_hash: str) -> bool:
    return hmac.compare_digest(hash_client_secret(secret), secret_hash)


def create_client_token(client: ApiClient, scopes: list[str]) -> str:
    token, _ = _create_token(
        subject=str(client.id),
        claims={
            "client_id": client.client_id,
            "scope": " ".join(scopes),
            "ver": client.secret_version,
        },
        ttl=timedelta(minutes=settings.client_token_ttl_minutes),
        token_type="client",
    )
    return token


async def get_current_client(
    security_scopes: SecurityScopes,
    authorization: str | None = Depends(client_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> ApiClient:
    """The API client behind a bearer token, checked against the scopes required.

    Use as `Security(get_current_client, scopes=[ApiClient.REQUESTS_READ])`.
    A user's access token is refused here, and a client token is refused by
    `get_current_user`, so neither can stand in for the other.
    """
    scheme, token = get_authorization_scheme_param(authorization)
    if not token or scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    if payload.get("type") != "client":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    client = await db.get(ApiClient, int(payload.get("sub", 0)))
    # A deactivated client, or a token minted before the secret was rotated,
    # stops working now rather than when the token expires.
    if client is None or not client.is_active or payload.get("ver") != client.secret_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Client revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Likewise a scope the admin has since taken away is gone immediately.
    granted = set(payload.get("scope", "").split()) & set(client.scopes)
    missing = [scope for scope in security_scopes.scopes if scope not in granted]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Ruxsat yetarli emas: {', '.join(missing)}",
            headers={"WWW-Authenticate": f'Bearer scope="{security_scopes.scope_str}"'},
        )
    return client


def client_ip(request: Request) -> str:
    """Caller IP as seen by our own nginx.

    nginx overwrites X-Real-IP with the address of the TCP peer, so a client
    cannot choose it. X-Forwarded-For is not used: nginx *appends* to whatever
    the client sent, so its first entry was attacker-controlled and rotating
    it bypassed the per-IP login limit entirely.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


async def check_brute_force(redis: Redis, *, identity: str, ip: str) -> None:
    """Reject the attempt if either the account or the source IP is over budget.

    Two counters, deliberately asymmetric (B-05). The per-account counter stops
    password guessing against one user; the per-IP counter — with a much higher
    budget — stops someone spraying many accounts from one host.

    The account counter first only delays (so a few typos never lock anyone
    out), then locks the account for the rest of the window once it reaches
    `login_lockout_attempts`. A lock an attacker can trigger is a real cost,
    but with the per-IP counter now keyed on an address the client cannot
    forge, reaching the lock takes many hosts — and without it a distributed
    guesser could try passwords against an admin account forever.
    """
    user_key = f"login:fail:user:{identity}"
    ip_key = f"login:fail:ip:{ip}"

    user_count, ip_count = await redis.mget(user_key, ip_key)

    if ip_count and int(ip_count) >= settings.login_max_attempts_per_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Juda ko'p urinish. Keyinroq qayta urinib ko'ring.",
            headers={"Retry-After": str(settings.login_window_seconds)},
        )

    if user_count and int(user_count) >= settings.login_lockout_attempts:
        # Past the backoff range: the account is locked for the rest of the
        # window. Backoff alone never stopped a patient attacker, it only
        # slowed each guess down.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Akkaunt vaqtincha bloklandi: juda ko'p noto'g'ri urinish. "
            "Keyinroq qayta urinib ko'ring.",
            headers={"Retry-After": str(settings.login_window_seconds)},
        )

    if user_count and int(user_count) >= settings.login_max_attempts_per_user:
        # First a short exponential delay, so a user who mistyped a few times
        # is slowed down rather than locked out.
        over = int(user_count) - settings.login_max_attempts_per_user
        delay = min(2**over, 30)
        await asyncio.sleep(delay)


async def record_login_failure(redis: Redis, *, identity: str, ip: str) -> None:
    window = settings.login_window_seconds
    pipe = redis.pipeline()
    for key in (f"login:fail:user:{identity}", f"login:fail:ip:{ip}"):
        pipe.incr(key)
        pipe.expire(key, window)
    await pipe.execute()


async def clear_login_failures(redis: Redis, *, identity: str, ip: str) -> None:
    await redis.delete(f"login:fail:user:{identity}", f"login:fail:ip:{ip}")
