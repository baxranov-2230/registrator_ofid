import asyncio
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.db import get_db
from app.core.redis import get_redis
from app.models import User


async def _redis_dep() -> Redis:
    """Redis handle for the auth dependencies.

    Declared here rather than imported from app.api.deps so that app.core does
    not depend on app.api; app.api.deps.get_redis_dep wraps the same client.
    """
    return get_redis()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

REFRESH_BLOCKLIST_PREFIX = "refresh:blocked:"
REFRESH_ACTIVE_PREFIX = "refresh:active:"
SESSION_SEEN_PREFIX = "session:seen:"


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


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


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
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


def client_ip(request: Request) -> str:
    """Caller IP, honouring the reverse proxy in front of the app.

    nginx sets X-Forwarded-For; uvicorn runs with --proxy-headers in production
    but we read the header defensively so rate limiting also works in dev.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def check_brute_force(redis: Redis, *, identity: str, ip: str) -> None:
    """Reject the attempt if either the account or the source IP is over budget.

    Two counters, deliberately asymmetric (B-05). The per-account counter stops
    password guessing against one user; the per-IP counter — with a much higher
    budget — stops someone spraying many accounts from one host. Keying on the
    account alone would let an attacker lock any user out at will, so the
    account counter only ever delays, while the IP counter does the real
    blocking.
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

    if user_count and int(user_count) >= settings.login_max_attempts_per_user:
        # Exponential backoff rather than a hard lock, so this cannot be used
        # to deny a legitimate user access to their own account.
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
