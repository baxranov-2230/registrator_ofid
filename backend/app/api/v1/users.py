from fastapi import APIRouter, Depends, HTTPException, Query
from redis.asyncio import Redis
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_redis_dep
from app.core.db import get_db
from app.core.security import (
    get_current_user,
    hash_password,
    require_roles,
    revoke_all_refresh_tokens,
)
from app.models import Employee, Role, Student, User
from app.schemas.request import Page
from app.schemas.user import AssigneeOut, UserCreate, UserOut, UserUpdate
from app.services.audit_service import log_action

router = APIRouter(prefix="/users", tags=["users"])


async def _assert_admin_remains(db: AsyncSession) -> None:
    """Guard the 'at least one active admin' invariant."""
    remaining = (
        await db.execute(
            select(func.count())
            .select_from(User)
            .join(Role)
            .where(Role.name == Role.ADMIN, User.is_active.is_(True))
        )
    ).scalar_one()
    if remaining == 0:
        raise HTTPException(
            status_code=400, detail="Tizimda kamida bitta faol administrator qolishi kerak"
        )


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.get("/assignees", response_model=list[AssigneeOut])
async def list_assignees(
    faculty_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    # The staff directory is for staff. Students, and the partner platform
    # acting for them, have no reason to enumerate employees.
    _user: User = Depends(require_roles(*Role.SEES_INTERNAL)),
) -> list[AssigneeOut]:
    stmt = (
        select(User)
        .options(selectinload(User.role))
        .join(Role)
        .where(Role.name.in_((Role.STAFF, Role.REGISTRATOR)))
        .where(User.is_active.is_(True))
    )
    if faculty_id is not None:
        # Faculty now hangs off the employee profile.
        stmt = stmt.join(Employee, Employee.user_id == User.id).where(
            Employee.faculty_id == faculty_id
        )
    stmt = stmt.order_by(User.full_name.asc())
    users = (await db.execute(stmt)).scalars().all()
    return [AssigneeOut.model_validate(u) for u in users]


@router.get("", response_model=Page[UserOut], dependencies=[Depends(require_roles(Role.ADMIN))])
async def list_users(
    role: str | None = None,
    faculty_id: int | None = None,
    is_active: bool | None = None,
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> Page[UserOut]:
    """Paginated directory. Students number in the thousands, so the page no
    longer downloads all of them to filter in the browser."""
    filters = []
    stmt = (
        select(User)
        .join(Role)
        .outerjoin(Employee, Employee.user_id == User.id)
        .outerjoin(Student, Student.user_id == User.id)
    )
    if role:
        filters.append(Role.name == role)
    if faculty_id is not None:
        # Either profile can carry the faculty.
        filters.append(or_(Employee.faculty_id == faculty_id, Student.faculty_id == faculty_id))
    if is_active is not None:
        filters.append(User.is_active == is_active)
    if search and search.strip():
        like = f"%{search.strip()}%"
        filters.append(
            or_(
                User.full_name.ilike(like),
                User.email.ilike(like),
                Student.external_student_id.ilike(like),
                Student.group_name.ilike(like),
            )
        )

    total = (
        await db.execute(select(func.count()).select_from(stmt.where(*filters).subquery()))
    ).scalar_one()
    users = (
        (
            await db.execute(
                stmt.where(*filters)
                .options(selectinload(User.role))
                .order_by(User.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return Page[UserOut](
        items=[UserOut.model_validate(u) for u in users], total=total, limit=limit, offset=offset
    )


@router.post(
    "", response_model=UserOut, status_code=201, dependencies=[Depends(require_roles(Role.ADMIN))]
)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> UserOut:
    role = (await db.execute(select(Role).where(Role.name == data.role_name))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=400, detail=f"Noma'lum rol: {data.role_name}")

    existing = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Bu email allaqachon ro'yxatdan o'tgan")

    user = User(
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
        role_id=role.id,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # This endpoint creates staff; students arrive through the integration API,
    # which builds their profile instead.
    if role.name == Role.STUDENT:
        db.add(Student(user_id=user.id))
    else:
        db.add(
            Employee(
                user_id=user.id,
                faculty_id=data.faculty_id,
                department_id=data.department_id,
            )
        )
    await db.flush()
    await db.refresh(user, attribute_names=["role", "student_profile", "employee_profile"])
    await log_action(
        db,
        user_id=actor.id,
        action="user.create",
        entity_type="user",
        entity_id=user.id,
        new_value={"email": user.email, "role": role.name},
    )
    await db.commit()
    return UserOut.model_validate(user)


@router.delete(
    "/{user_id}",
    status_code=204,
    dependencies=[Depends(require_roles(Role.ADMIN))],
)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="O'zingizni o'chira olmaysiz")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    user.is_active = False
    await db.flush()
    await _assert_admin_remains(db)
    await log_action(
        db,
        user_id=actor.id,
        action="user.deactivate",
        entity_type="user",
        entity_id=user.id,
    )
    await db.commit()
    return None


@router.patch(
    "/{user_id}",
    response_model=UserOut,
    dependencies=[Depends(require_roles(Role.ADMIN))],
)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
    actor: User = Depends(get_current_user),
) -> UserOut:
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.role), selectinload(User.employee_profile))
    )
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    old = {
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role.name if user.role else None,
        "is_active": user.is_active,
        "faculty_id": user.faculty_id,
        "totp_enabled": user.totp_enabled,
    }

    # `model_fields_set` separates "sent as null" (clear it) from "not sent"
    # (leave it). Checking `is not None` made a faculty binding impossible to
    # remove once set.
    sent = data.model_fields_set

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        user.email = data.email
    if "phone" in sent:
        user.phone = data.phone or None
    # Faculty/department are employee attributes now; ensure the profile row
    # exists before writing to it.
    if "faculty_id" in sent or "department_id" in sent:
        profile = user.employee_profile
        if profile is None:
            profile = Employee(user_id=user.id)
            db.add(profile)
            user.employee_profile = profile
        if "faculty_id" in sent:
            profile.faculty_id = data.faculty_id
        if "department_id" in sent:
            profile.department_id = data.department_id
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password is not None:
        user.password_hash = hash_password(data.password)
    if data.reset_2fa:
        user.totp_enabled = False
        user.totp_secret = None
    if data.role_name is not None:
        role = (
            await db.execute(select(Role).where(Role.name == data.role_name))
        ).scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=400, detail=f"Noma'lum rol: {data.role_name}")
        user.role_id = role.id

    # Losing the last admin means the system can only be recovered from the
    # database, so both self-demotion and self-deactivation are blocked (B-11).
    if user.id == actor.id:
        if data.is_active is False:
            raise HTTPException(status_code=400, detail="O'zingizni deaktiv qila olmaysiz")
        if data.role_name is not None and data.role_name != Role.ADMIN:
            raise HTTPException(status_code=400, detail="O'z rolingizni o'zgartira olmaysiz")

    await db.flush()
    await _assert_admin_remains(db)
    await db.refresh(user, attribute_names=["role", "student_profile", "employee_profile"])
    new = {
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role.name if user.role else None,
        "is_active": user.is_active,
        "faculty_id": user.faculty_id,
        "totp_enabled": user.totp_enabled,
    }
    await log_action(
        db,
        user_id=actor.id,
        action="user.update",
        entity_type="user",
        entity_id=user.id,
        old_value=old,
        new_value=new,
    )
    await db.commit()
    # A reset password must also end the sessions opened with the old one.
    if data.password is not None or data.reset_2fa:
        await revoke_all_refresh_tokens(redis, user.id)
    return UserOut.model_validate(user)
