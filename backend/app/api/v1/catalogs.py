from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user, require_roles
from app.models import Department, Faculty, RequestCategory, Role, User
from app.schemas.catalog import (
    CategoryCreate,
    CategoryOut,
    CategoryTreeNode,
    DepartmentCreate,
    DepartmentOut,
    FacultyCreate,
    FacultyOut,
)

router = APIRouter(tags=["catalogs"])


@router.get("/faculties", response_model=list[FacultyOut])
async def list_faculties(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[FacultyOut]:
    rows = (
        await db.execute(select(Faculty).where(Faculty.is_active.is_(True)).order_by(Faculty.name))
    ).scalars().all()
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


@router.get("/categories", response_model=list[CategoryTreeNode])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CategoryTreeNode]:
    rows = (
        await db.execute(
            select(RequestCategory)
            .where(RequestCategory.is_active.is_(True))
            .order_by(RequestCategory.name)
        )
    ).scalars().all()

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


admin_router = APIRouter(prefix="/admin", tags=["admin-catalogs"])


@admin_router.post(
    "/faculties",
    response_model=FacultyOut,
    status_code=201,
    dependencies=[Depends(require_roles(Role.ADMIN))],
)
async def create_faculty(
    data: FacultyCreate, db: AsyncSession = Depends(get_db)
) -> FacultyOut:
    fac = Faculty(name=data.name, code=data.code, contact_email=data.contact_email, is_active=True)
    db.add(fac)
    await db.commit()
    await db.refresh(fac)
    return FacultyOut.model_validate(fac)


@admin_router.post(
    "/departments",
    response_model=DepartmentOut,
    status_code=201,
    dependencies=[Depends(require_roles(Role.ADMIN))],
)
async def create_department(
    data: DepartmentCreate, db: AsyncSession = Depends(get_db)
) -> DepartmentOut:
    fac = (await db.execute(select(Faculty).where(Faculty.id == data.faculty_id))).scalar_one_or_none()
    if not fac:
        raise HTTPException(status_code=404, detail="Faculty not found")
    dept = Department(faculty_id=fac.id, name=data.name, code=data.code)
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return DepartmentOut.model_validate(dept)


@admin_router.post(
    "/categories",
    response_model=CategoryOut,
    status_code=201,
    dependencies=[Depends(require_roles(Role.ADMIN))],
)
async def create_category(
    data: CategoryCreate, db: AsyncSession = Depends(get_db)
) -> CategoryOut:
    if data.parent_id:
        parent = (
            await db.execute(select(RequestCategory).where(RequestCategory.id == data.parent_id))
        ).scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")
    cat = RequestCategory(
        parent_id=data.parent_id,
        name=data.name,
        sla_hours=data.sla_hours,
        priority=data.priority,
        icon=data.icon,
        is_active=True,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return CategoryOut.model_validate(cat)
