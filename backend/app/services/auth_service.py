from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    create_access_token,
    create_refresh_token,
    new_session_id,
    register_refresh_jti,
    touch_session,
    verify_password,
)
from app.models import Faculty, Role, Student, StudentGroup, User


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


def _slugify_code(name: str, length: int = 16) -> str:
    """Make a short uppercase code from a name if one isn't supplied."""
    parts = [p for p in (name or "").split() if p]
    short = "".join(p[0] for p in parts) or (name or "").replace(" ", "")
    return short.upper()[:length] or "F"


async def _upsert_faculty(db: AsyncSession, name: str | None) -> Faculty | None:
    """Find a Faculty by name, creating it if missing."""
    if not name:
        return None

    row = (await db.execute(select(Faculty).where(Faculty.name == name))).scalar_one_or_none()
    if row:
        return row

    # Ensure uniqueness — append digits if the code is taken
    code = _slugify_code(name)[:32]
    suffix = 0
    candidate = code
    while True:
        exists = (
            await db.execute(select(Faculty).where(Faculty.code == candidate))
        ).scalar_one_or_none()
        if not exists:
            break
        suffix += 1
        candidate = f"{code[:29]}-{suffix}"

    row = Faculty(name=name, code=candidate, is_active=True)
    db.add(row)
    await db.flush()
    return row


async def _upsert_student_group(
    db: AsyncSession, name: str | None, faculty: Faculty | None
) -> StudentGroup | None:
    """Find a group by name within the faculty, creating it if missing."""
    if not name:
        return None

    row = (
        await db.execute(
            select(StudentGroup)
            .where(StudentGroup.name == name)
            .where(StudentGroup.faculty_id == (faculty.id if faculty else None))
        )
    ).scalar_one_or_none()
    if row:
        return row

    row = StudentGroup(name=name, faculty_id=faculty.id if faculty else None, is_active=True)
    db.add(row)
    await db.flush()
    return row


async def sync_student_from_profile(db: AsyncSession, profile: dict) -> User:
    """Upsert a student User row from a profile supplied by an API client.

    Auto-creates Faculty and StudentGroup records as needed.
    """
    student_id = profile.get("student_id_number")
    if not student_id:
        raise AuthError("Talaba ID ko'rsatilmagan")

    stmt = (
        select(User)
        .join(Student, Student.user_id == User.id)
        .where(Student.external_student_id == student_id)
        .options(selectinload(User.role), selectinload(User.student_profile))
    )
    user = (await db.execute(stmt)).scalar_one_or_none()

    role_stmt = select(Role).where(Role.name == Role.STUDENT)
    student_role = (await db.execute(role_stmt)).scalar_one()

    faculty = await _upsert_faculty(db, profile.get("faculty"))
    group = await _upsert_student_group(db, profile.get("group"), faculty)

    def _apply_profile(u: User, sp: Student) -> None:
        """Identity fields land on `users`, academic ones on `students`."""
        u.full_name = profile.get("full_name") or u.full_name

        sp.external_student_id = student_id
        if faculty:
            sp.faculty_id = faculty.id
        if group:
            sp.student_group_id = group.id
            sp.group_name = group.name
        sp.image_path = profile.get("image_path") or sp.image_path

    if user is None:
        user = User(
            full_name=profile.get("full_name", student_id),
            role_id=student_role.id,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        student_profile = Student(user_id=user.id)
        db.add(student_profile)
        user.student_profile = student_profile
        _apply_profile(user, student_profile)
        await db.flush()
        await db.refresh(user, attribute_names=["role"])
    else:
        # An identity created before the split may have no profile row yet.
        student_profile = user.student_profile
        if student_profile is None:
            student_profile = Student(user_id=user.id)
            db.add(student_profile)
            user.student_profile = student_profile
        _apply_profile(user, student_profile)
        await db.flush()

    return user


async def issue_tokens(redis, user: User) -> tuple[str, str]:
    """Mint a fresh access/refresh pair for a new login session."""
    session_id = new_session_id()
    access = create_access_token(user, session_id)
    refresh, jti = create_refresh_token(user, session_id)
    await register_refresh_jti(redis, user.id, jti)
    # Open the idle window; from here the session lives as long as the user
    # keeps touching the API.
    await touch_session(redis, session_id)
    return access, refresh
