import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.db import get_db
from app.core.redis import get_redis
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

REFRESH_BLOCKLIST_PREFIX = "refresh:blocked:"
REFRESH_ACTIVE_PREFIX = "refresh:active:"


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


def create_access_token(user: User) -> str:
    claims = {
        "role": user.role.name if user.role else None,
        "faculty_id": user.faculty_id,
        "full_name": user.full_name,
    }
    token, _ = _create_token(
        subject=str(user.id),
        claims=claims,
        ttl=timedelta(minutes=settings.jwt_access_ttl_minutes),
        token_type="access",
    )
    return token


def create_refresh_token(user: User) -> tuple[str, str]:
    token, jti = _create_token(
        subject=str(user.id),
        claims={},
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


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type"
        )
    user_id = int(payload.get("sub", 0))
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    from sqlalchemy import select

    stmt = select(User).where(User.id == user_id).options(selectinload(User.role))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")
    return user


def require_roles(*role_names: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.role is None or user.role.name not in role_names:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
            )
        return user

    return _check


async def check_brute_force(redis: Redis, key: str, max_attempts: int = 5, window: int = 900) -> None:
    """Raise 429 if login attempts exceeded; otherwise increment counter."""
    count_key = f"login:fail:{key}"
    count = await redis.get(count_key)
    if count and int(count) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again later.",
        )


async def record_login_failure(redis: Redis, key: str, window: int = 900) -> None:
    count_key = f"login:fail:{key}"
    count = await redis.incr(count_key)
    if count == 1:
        await redis.expire(count_key, window)


async def clear_login_failures(redis: Redis, key: str) -> None:
    await redis.delete(f"login:fail:{key}")
