from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_redis_dep
from app.core.db import get_db
from app.core.security import (
    check_brute_force,
    clear_login_failures,
    create_access_token,
    decode_token,
    get_current_user,
    is_refresh_jti_valid,
    record_login_failure,
    register_refresh_jti,
    revoke_refresh_jti,
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


@router.post("/login", response_model=TokenPair)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    key = data.email.lower()
    await check_brute_force(redis, key)
    try:
        user = await authenticate_local(db, email=data.email, password=data.password)
    except AuthError as exc:
        await record_login_failure(redis, key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await clear_login_failures(redis, key)
    access, refresh = await issue_tokens(redis, user)
    await log_action(
        db,
        user_id=user.id,
        action="login",
        entity_type="user",
        entity_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/login/hemis", response_model=TokenPair)
async def login_hemis(
    data: HemisLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    key = f"hemis:{data.username.lower()}"
    await check_brute_force(redis, key)
    try:
        user = await authenticate_student_hemis(db, username=data.username, password=data.password)
    except AuthError as exc:
        await record_login_failure(redis, key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await clear_login_failures(redis, key)
    access, refresh = await issue_tokens(redis, user)
    await log_action(
        db,
        user_id=user.id,
        action="login_hemis",
        entity_type="user",
        entity_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/hemis/exchange", response_model=TokenPair)
async def hemis_exchange(
    data: HemisTokenRequest,
    request: Request,
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc

    access, refresh = await issue_tokens(redis, user)
    await log_action(
        db,
        user_id=user.id,
        action="login_hemis_token",
        entity_type="user",
        entity_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    payload = decode_token(data.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    user_id = int(payload.get("sub", 0))
    jti = payload.get("jti")
    if not user_id or not jti or not await is_refresh_jti_valid(redis, user_id, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalid or revoked"
        )

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    stmt = select(User).where(User.id == user_id).options(selectinload(User.role))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")

    await revoke_refresh_jti(redis, user_id, jti)
    new_refresh, new_jti = _create_refresh_token(user)
    await register_refresh_jti(redis, user.id, new_jti)
    access = create_access_token(user)
    return TokenPair(access_token=access, refresh_token=new_refresh)


@router.post("/logout", status_code=204)
async def logout(
    data: RefreshRequest,
    redis: Redis = Depends(get_redis_dep),
) -> None:
    payload = decode_token(data.refresh_token)
    if payload.get("type") != "refresh":
        return None
    user_id = int(payload.get("sub", 0))
    jti = payload.get("jti")
    if user_id and jti:
        await revoke_refresh_jti(redis, user_id, jti)
    return None


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
