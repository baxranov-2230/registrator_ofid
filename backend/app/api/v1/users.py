from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.security import get_current_user, hash_password, require_roles
from app.models import Role, User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.audit_service import log_action

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_roles(Role.ADMIN))])
async def list_users(
    role: str | None = None,
    faculty_id: int | None = None,
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[UserOut]:
    stmt = select(User).options(selectinload(User.role))
    if role:
        stmt = stmt.join(Role).where(Role.name == role)
    if faculty_id is not None:
        stmt = stmt.where(User.faculty_id == faculty_id)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    stmt = stmt.order_by(User.id.desc())
    users = (await db.execute(stmt)).scalars().all()
    return [UserOut.model_validate(u) for u in users]


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
        raise HTTPException(status_code=400, detail=f"Unknown role: {data.role_name}")

    existing = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
        role_id=role.id,
        faculty_id=data.faculty_id,
        department_id=data.department_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user, attribute_names=["role"])
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
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
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
    actor: User = Depends(get_current_user),
) -> UserOut:
    stmt = select(User).where(User.id == user_id).options(selectinload(User.role))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old = {
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role.name if user.role else None,
        "is_active": user.is_active,
    }

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        user.email = data.email
    if data.phone is not None:
        user.phone = data.phone
    if data.faculty_id is not None:
        user.faculty_id = data.faculty_id
    if data.department_id is not None:
        user.department_id = data.department_id
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password is not None:
        user.password_hash = hash_password(data.password)
    if data.role_name is not None:
        role = (
            await db.execute(select(Role).where(Role.name == data.role_name))
        ).scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=400, detail=f"Unknown role: {data.role_name}")
        user.role_id = role.id

    await db.flush()
    await db.refresh(user, attribute_names=["role"])
    new = {
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role.name if user.role else None,
        "is_active": user.is_active,
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
    return UserOut.model_validate(user)
