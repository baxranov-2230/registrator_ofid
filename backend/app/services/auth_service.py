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
from app.models import Faculty, Role, StudentGroup, User
from app.services.hemis_client import HemisAuthError, hemis_fetch_me, hemis_login


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


async def _upsert_faculty(db: AsyncSession, ref: dict | None) -> Faculty | None:
    """Find a Faculty by HEMIS id or name, creating it if missing."""
    if not ref or not ref.get("name"):
        return None
    hemis_id = ref.get("hemis_id")
    name = ref["name"]
    code_raw = ref.get("code")

    if hemis_id:
        row = (
            await db.execute(select(Faculty).where(Faculty.hemis_id == str(hemis_id)))
        ).scalar_one_or_none()
        if row:
            if row.name != name:
                row.name = name
            return row

    row = (await db.execute(select(Faculty).where(Faculty.name == name))).scalar_one_or_none()
    if row:
        if hemis_id and not row.hemis_id:
            row.hemis_id = str(hemis_id)
        return row

    # Resolve a unique code
    code = (str(code_raw) if code_raw else _slugify_code(name))[:32]
    # Ensure uniqueness — append digits if taken
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

    row = Faculty(
        name=name,
        code=candidate,
        hemis_id=str(hemis_id) if hemis_id else None,
        is_active=True,
    )
    db.add(row)
    await db.flush()
    return row


async def _upsert_student_group(
    db: AsyncSession,
    ref: dict | None,
    faculty: Faculty | None,
    specialty: str | None,
    education_year: str | None,
) -> StudentGroup | None:
    if not ref or not ref.get("name"):
        return None
    hemis_id = ref.get("hemis_id")
    name = ref["name"]

    if hemis_id:
        row = (
            await db.execute(
                select(StudentGroup).where(StudentGroup.hemis_id == str(hemis_id))
            )
        ).scalar_one_or_none()
        if row:
            if faculty and row.faculty_id != faculty.id:
                row.faculty_id = faculty.id
            if specialty and row.specialty != specialty:
                row.specialty = specialty
            if education_year and row.education_year != education_year:
                row.education_year = education_year
            return row

    row = (
        await db.execute(
            select(StudentGroup)
            .where(StudentGroup.name == name)
            .where(
                StudentGroup.faculty_id == (faculty.id if faculty else None)
            )
        )
    ).scalar_one_or_none()
    if row:
        if hemis_id and not row.hemis_id:
            row.hemis_id = str(hemis_id)
        return row

    row = StudentGroup(
        name=name,
        hemis_id=str(hemis_id) if hemis_id else None,
        faculty_id=faculty.id if faculty else None,
        specialty=specialty,
        education_year=education_year,
        is_active=True,
    )
    db.add(row)
    await db.flush()
    return row


async def sync_student_from_profile(
    db: AsyncSession, profile: dict, fallback_student_id: str | None = None
) -> User:
    """Upsert a student User row from a normalized HEMIS profile dict.

    Auto-creates Faculty and StudentGroup records as needed.
    """
    student_id = profile.get("student_id_number") or fallback_student_id
    if not student_id:
        raise AuthError("HEMIS profilida talaba ID topilmadi")

    stmt = (
        select(User)
        .where(User.external_student_id == student_id)
        .options(selectinload(User.role))
    )
    user = (await db.execute(stmt)).scalar_one_or_none()

    role_stmt = select(Role).where(Role.name == Role.STUDENT)
    student_role = (await db.execute(role_stmt)).scalar_one()

    faculty = await _upsert_faculty(db, profile.get("faculty"))
    group = await _upsert_student_group(
        db,
        profile.get("group"),
        faculty,
        profile.get("specialty"),
        profile.get("education_year"),
    )

    def _apply_profile(u: User) -> None:
        u.full_name = profile.get("full_name") or u.full_name
        if profile.get("email"):
            u.email = profile["email"]
        if profile.get("phone"):
            u.phone = profile["phone"]
        if faculty:
            u.faculty_id = faculty.id
        if group:
            u.student_group_id = group.id
            u.group_name = group.name
        u.birth_date = profile.get("birth_date") or u.birth_date
        u.gender = profile.get("gender") or u.gender
        u.address = profile.get("address") or u.address
        u.image_path = profile.get("image_path") or u.image_path
        u.specialty = profile.get("specialty") or u.specialty
        u.level = profile.get("level") or u.level
        u.semester = profile.get("semester") or u.semester
        u.student_status = profile.get("student_status") or u.student_status
        u.education_form = profile.get("education_form") or u.education_form
        u.education_type = profile.get("education_type") or u.education_type
        u.education_lang = profile.get("education_lang") or u.education_lang
        u.payment_form = profile.get("payment_form") or u.payment_form
        u.last_login_at = datetime.now(UTC)

    if user is None:
        user = User(
            full_name=profile.get("full_name", student_id),
            email=profile.get("email"),
            phone=profile.get("phone"),
            role_id=student_role.id,
            faculty_id=faculty.id if faculty else None,
            student_group_id=group.id if group else None,
            external_student_id=student_id,
            is_active=True,
        )
        db.add(user)
        _apply_profile(user)
        await db.flush()
        await db.refresh(user, attribute_names=["role"])
    else:
        _apply_profile(user)
        await db.flush()

    return user


async def authenticate_student_hemis(
    db: AsyncSession, username: str, password: str
) -> User:
    try:
        profile = await hemis_login(username, password)
    except HemisAuthError as exc:
        raise AuthError(str(exc)) from exc
    return await sync_student_from_profile(db, profile, fallback_student_id=username)


async def authenticate_student_by_hemis_token(
    db: AsyncSession, hemis_token: str
) -> User:
    """Validate a HEMIS token against the HEMIS /me endpoint, then sync local user."""
    try:
        profile = await hemis_fetch_me(hemis_token)
    except HemisAuthError as exc:
        raise AuthError(str(exc)) from exc
    return await sync_student_from_profile(db, profile)


async def issue_tokens(redis, user: User) -> tuple[str, str]:
    access = create_access_token(user)
    refresh, jti = create_refresh_token(user)
    await register_refresh_jti(redis, user.id, jti)
    return access, refresh
