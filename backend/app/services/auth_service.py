from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    clear_login_failures,
    create_access_token,
    create_refresh_token,
    record_login_failure,
    register_refresh_jti,
    verify_password,
)
from app.models import Faculty, Role, User
from app.services.hemis_client import HemisAuthError, hemis_login


class AuthError(Exception):
    pass


async def authenticate_local(db: AsyncSession, email: str, password: str) -> User:
    stmt = select(User).where(User.email == email).options(selectinload(User.role))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not user.password_hash:
        raise AuthError("Email yoki parol noto'g'ri")
    if not user.is_active:
        raise AuthError("Akkaunt faol emas")
    if not verify_password(password, user.password_hash):
        raise AuthError("Email yoki parol noto'g'ri")
    user.last_login_at = datetime.now(UTC)
    await db.flush()
    return user


async def authenticate_student_hemis(
    db: AsyncSession, username: str, password: str
) -> User:
    try:
        profile = await hemis_login(username, password)
    except HemisAuthError as exc:
        raise AuthError(str(exc)) from exc

    student_id = profile.get("student_id_number") or username
    stmt = (
        select(User)
        .where(User.external_student_id == student_id)
        .options(selectinload(User.role))
    )
    user = (await db.execute(stmt)).scalar_one_or_none()

    role_stmt = select(Role).where(Role.name == Role.STUDENT)
    student_role = (await db.execute(role_stmt)).scalar_one()

    faculty_id: int | None = None
    if profile.get("faculty_name"):
        fac_stmt = select(Faculty).where(Faculty.name == profile["faculty_name"])
        fac = (await db.execute(fac_stmt)).scalar_one_or_none()
        if fac:
            faculty_id = fac.id

    if user is None:
        user = User(
            full_name=profile.get("full_name", student_id),
            email=profile.get("email"),
            phone=profile.get("phone"),
            role_id=student_role.id,
            faculty_id=faculty_id,
            external_student_id=student_id,
            is_active=True,
            last_login_at=datetime.now(UTC),
        )
        db.add(user)
        await db.flush()
        await db.refresh(user, attribute_names=["role"])
    else:
        user.full_name = profile.get("full_name") or user.full_name
        if profile.get("email"):
            user.email = profile["email"]
        if profile.get("phone"):
            user.phone = profile["phone"]
        if faculty_id:
            user.faculty_id = faculty_id
        user.last_login_at = datetime.now(UTC)
        await db.flush()

    return user


async def issue_tokens(redis, user: User) -> tuple[str, str]:
    access = create_access_token(user)
    refresh, jti = create_refresh_token(user)
    await register_refresh_jti(redis, user.id, jti)
    return access, refresh
