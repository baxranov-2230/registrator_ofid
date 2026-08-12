from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user, require_roles
from app.models import Department, Faculty, RequestCategory, Role, StudentGroup, User
from app.schemas.catalog import (
    CategoryCreate,
    CategoryOut,
    CategoryTreeNode,
    CategoryUpdate,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    FacultyCreate,
    FacultyOut,
    FacultyUpdate,
    StudentGroupOut,
    StudentGroupUpdate,
)
from app.services.audit_service import log_action

router = APIRouter(tags=["catalogs"])


@router.get("/faculties", response_model=list[FacultyOut])
async def list_faculties(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FacultyOut]:
    stmt = select(Faculty).order_by(Faculty.name)
    # Only administrators have a reason to see retired entries.
    if not (include_inactive and user.has_role(Role.ADMIN)):
        stmt = stmt.where(Faculty.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    return [FacultyOut.model_validate(r) for r in rows]


@router.get("/departments", response_model=list[DepartmentOut])
async def list_departments(
    faculty_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DepartmentOut]:
    stmt = select(Department).order_by(Department.name)
    if faculty_id is not None:
        stmt = stmt.where(Department.faculty_id == faculty_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [DepartmentOut.model_validate(r) for r in rows]


@router.get("/groups", response_model=list[StudentGroupOut])
async def list_student_groups(
    faculty_id: int | None = None,
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[StudentGroupOut]:
    stmt = select(StudentGroup).order_by(StudentGroup.name)
    if faculty_id is not None:
        stmt = stmt.where(StudentGroup.faculty_id == faculty_id)
    if not (include_inactive and user.has_role(Role.ADMIN)):
        stmt = stmt.where(StudentGroup.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    return [StudentGroupOut.model_validate(r) for r in rows]


@router.get("/categories", response_model=list[CategoryTreeNode])
async def list_categories(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CategoryTreeNode]:
    stmt = select(RequestCategory).order_by(RequestCategory.name)
    if not (include_inactive and user.has_role(Role.ADMIN)):
        stmt = stmt.where(RequestCategory.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()

    nodes: dict[int, CategoryTreeNode] = {
        r.id: CategoryTreeNode(
            id=r.id,
            parent_id=r.parent_id,
            name=r.name,
            sla_hours=r.sla_hours,
            priority=r.priority,
            is_active=r.is_active,
            icon=r.icon,
            children=[],
        )
        for r in rows
    }
    roots: list[CategoryTreeNode] = []
    for r in rows:
        node = nodes[r.id]
        if r.parent_id and r.parent_id in nodes:
            nodes[r.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


# ── Admin catalog management ────────────────────────────────────────────────
# Catalogs are referenced by historical requests, so nothing is hard-deleted;
# `is_active=False` retires an entry while keeping old rows resolvable (C-05).

admin_router = APIRouter(
    prefix="/admin",
    tags=["admin-catalogs"],
    dependencies=[Depends(require_roles(*Role.CAN_ADMINISTER))],
)


@admin_router.post("/faculties", response_model=FacultyOut, status_code=201)
async def create_faculty(
    data: FacultyCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> FacultyOut:
    fac = Faculty(name=data.name, code=data.code, contact_email=data.contact_email, is_active=True)
    db.add(fac)
    await db.flush()
    await log_action(
        db,
        user_id=actor.id,
        action="faculty.create",
        entity_type="faculty",
        entity_id=fac.id,
        new_value={"name": fac.name, "code": fac.code},
    )
    await db.commit()
    await db.refresh(fac)
    return FacultyOut.model_validate(fac)


@admin_router.patch("/faculties/{faculty_id}", response_model=FacultyOut)
async def update_faculty(
    faculty_id: int,
    data: FacultyUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> FacultyOut:
    fac = await db.get(Faculty, faculty_id)
    if not fac:
        raise HTTPException(status_code=404, detail="Fakultet topilmadi")

    old = {"name": fac.name, "code": fac.code, "is_active": fac.is_active}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(fac, field, value)

    await db.flush()
    await log_action(
        db,
        user_id=actor.id,
        action="faculty.update",
        entity_type="faculty",
        entity_id=fac.id,
        old_value=old,
        new_value={"name": fac.name, "code": fac.code, "is_active": fac.is_active},
    )
    await db.commit()
    await db.refresh(fac)
    return FacultyOut.model_validate(fac)


@admin_router.delete("/faculties/{faculty_id}", status_code=204)
async def deactivate_faculty(
    faculty_id: int,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    fac = await db.get(Faculty, faculty_id)
    if not fac:
        raise HTTPException(status_code=404, detail="Fakultet topilmadi")
    fac.is_active = False
    await log_action(
        db,
        user_id=actor.id,
        action="faculty.deactivate",
        entity_type="faculty",
        entity_id=fac.id,
    )
    await db.commit()


@admin_router.post("/departments", response_model=DepartmentOut, status_code=201)
async def create_department(
    data: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> DepartmentOut:
    if not await db.get(Faculty, data.faculty_id):
        raise HTTPException(status_code=404, detail="Fakultet topilmadi")
    dept = Department(faculty_id=data.faculty_id, name=data.name, code=data.code)
    db.add(dept)
    await db.flush()
    await log_action(
        db,
        user_id=actor.id,
        action="department.create",
        entity_type="department",
        entity_id=dept.id,
        new_value={"name": dept.name, "code": dept.code},
    )
    await db.commit()
    await db.refresh(dept)
    return DepartmentOut.model_validate(dept)


@admin_router.patch("/departments/{department_id}", response_model=DepartmentOut)
async def update_department(
    department_id: int,
    data: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> DepartmentOut:
    dept = await db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Bo'lim topilmadi")

    payload = data.model_dump(exclude_unset=True)
    if "faculty_id" in payload and not await db.get(Faculty, payload["faculty_id"]):
        raise HTTPException(status_code=404, detail="Fakultet topilmadi")

    old = {"name": dept.name, "code": dept.code, "faculty_id": dept.faculty_id}
    for field, value in payload.items():
        setattr(dept, field, value)

    await db.flush()
    await log_action(
        db,
        user_id=actor.id,
        action="department.update",
        entity_type="department",
        entity_id=dept.id,
        old_value=old,
        new_value=payload,
    )
    await db.commit()
    await db.refresh(dept)
    return DepartmentOut.model_validate(dept)


@admin_router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> CategoryOut:
    if data.parent_id and not await db.get(RequestCategory, data.parent_id):
        raise HTTPException(status_code=404, detail="Ota kategoriya topilmadi")

    cat = RequestCategory(
        parent_id=data.parent_id,
        name=data.name,
        sla_hours=data.sla_hours,
        priority=data.priority,
        icon=data.icon,
        is_active=True,
    )
    db.add(cat)
    await db.flush()
    await log_action(
        db,
        user_id=actor.id,
        action="category.create",
        entity_type="category",
        entity_id=cat.id,
        new_value={"name": cat.name, "sla_hours": cat.sla_hours, "priority": cat.priority},
    )
    await db.commit()
    await db.refresh(cat)
    return CategoryOut.model_validate(cat)


@admin_router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> CategoryOut:
    cat = await db.get(RequestCategory, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Kategoriya topilmadi")

    payload = data.model_dump(exclude_unset=True)
    if payload.get("parent_id") == category_id:
        raise HTTPException(status_code=400, detail="Kategoriya o'ziga ota bo'la olmaydi")
    if payload.get("parent_id") and not await db.get(RequestCategory, payload["parent_id"]):
        raise HTTPException(status_code=404, detail="Ota kategoriya topilmadi")

    old = {"name": cat.name, "sla_hours": cat.sla_hours, "priority": cat.priority}
    for field, value in payload.items():
        setattr(cat, field, value)

    await db.flush()
    await log_action(
        db,
        user_id=actor.id,
        action="category.update",
        entity_type="category",
        entity_id=cat.id,
        old_value=old,
        new_value=payload,
    )
    await db.commit()
    await db.refresh(cat)
    return CategoryOut.model_validate(cat)


@admin_router.delete("/categories/{category_id}", status_code=204)
async def deactivate_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    cat = await db.get(RequestCategory, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Kategoriya topilmadi")
    cat.is_active = False
    await log_action(
        db,
        user_id=actor.id,
        action="category.deactivate",
        entity_type="category",
        entity_id=cat.id,
    )
    await db.commit()


@admin_router.patch("/groups/{group_id}", response_model=StudentGroupOut)
async def update_student_group(
    group_id: int,
    data: StudentGroupUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> StudentGroupOut:
    """Groups arrive from HEMIS sync; this allows local corrections."""
    group = await db.get(StudentGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Guruh topilmadi")

    payload = data.model_dump(exclude_unset=True)
    old = {"name": group.name, "faculty_id": group.faculty_id, "is_active": group.is_active}
    for field, value in payload.items():
        setattr(group, field, value)

    await db.flush()
    await log_action(
        db,
        user_id=actor.id,
        action="group.update",
        entity_type="student_group",
        entity_id=group.id,
        old_value=old,
        new_value=payload,
    )
    await db.commit()
    await db.refresh(group)
    return StudentGroupOut.model_validate(group)
