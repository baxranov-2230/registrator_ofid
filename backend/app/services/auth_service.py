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
from app.models import Department, Faculty, Role, Student, StudentGroup, User
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


async def _upsert_department(
    db: AsyncSession, ref: dict | None, faculty: Faculty | None
) -> Department | None:
    """Find or create a Department from a HEMIS reference.

    Without this the student's department_id was never populated, so every
    request inherited a NULL department and department-level routing and
    reporting could never work (C-08).
    """
    if not ref or not ref.get("name") or faculty is None:
        return None

    name = ref["name"]
    row = (
        await db.execute(
            select(Department).where(Department.faculty_id == faculty.id, Department.name == name)
        )
    ).scalar_one_or_none()
    if row:
        return row

    code = (str(ref.get("code")) if ref.get("code") else _slugify_code(name))[:32]
    suffix = 0
    candidate = code
    while (
        await db.execute(select(Department).where(Department.code == candidate))
    ).scalar_one_or_none():
        suffix += 1
        candidate = f"{code[:29]}-{suffix}"

    row = Department(faculty_id=faculty.id, name=name, code=candidate)
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
            await db.execute(select(StudentGroup).where(StudentGroup.hemis_id == str(hemis_id)))
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
            .where(StudentGroup.faculty_id == (faculty.id if faculty else None))
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

    # The HEMIS id now lives on the student profile, so look the identity up
    # through it rather than on `users`.
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
    department = await _upsert_department(db, profile.get("department"), faculty)
    group = await _upsert_student_group(
        db,
        profile.get("group"),
        faculty,
        profile.get("specialty"),
        profile.get("education_year"),
    )

    def _apply_profile(u: User, sp: Student) -> None:
        """Identity fields land on `users`, academic ones on `students`."""
        u.full_name = profile.get("full_name") or u.full_name
        if profile.get("email"):
            u.email = profile["email"]
        if profile.get("phone"):
            u.phone = profile["phone"]
        u.last_login_at = datetime.now(UTC)

        sp.external_student_id = student_id
        if faculty:
            sp.faculty_id = faculty.id
        if group:
            sp.student_group_id = group.id
            sp.group_name = group.name
        sp.birth_date = profile.get("birth_date") or sp.birth_date
        sp.gender = profile.get("gender") or sp.gender
        sp.address = profile.get("address") or sp.address
        sp.image_path = profile.get("image_path") or sp.image_path
        sp.specialty = profile.get("specialty") or sp.specialty
        sp.level = profile.get("level") or sp.level
        sp.semester = profile.get("semester") or sp.semester
        sp.student_status = profile.get("student_status") or sp.student_status
        sp.education_form = profile.get("education_form") or sp.education_form
        sp.education_type = profile.get("education_type") or sp.education_type
        sp.education_lang = profile.get("education_lang") or sp.education_lang
        sp.payment_form = profile.get("payment_form") or sp.payment_form

    if user is None:
        user = User(
            full_name=profile.get("full_name", student_id),
            email=profile.get("email"),
            phone=profile.get("phone"),
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


async def authenticate_student_hemis(db: AsyncSession, username: str, password: str) -> User:
    try:
        profile = await hemis_login(username, password)
    except HemisAuthError as exc:
        raise AuthError(str(exc)) from exc
    return await sync_student_from_profile(db, profile, fallback_student_id=username)


async def authenticate_student_by_hemis_token(db: AsyncSession, hemis_token: str) -> User:
    """Validate a HEMIS token against the HEMIS /me endpoint, then sync local user."""
    try:
        profile = await hemis_fetch_me(hemis_token)
    except HemisAuthError as exc:
        raise AuthError(str(exc)) from exc
    return await sync_student_from_profile(db, profile)


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
