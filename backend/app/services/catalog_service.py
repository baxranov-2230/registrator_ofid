"""Validation for the service-type → service selection on a new request.

The client narrows a 59-item list down to one service by first picking a type,
but that narrowing is a convenience, not a guarantee: a request can be posted
straight to the API. Every rule the form enforces is therefore re-checked here.
"""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RequestCategory
from app.schemas.catalog import CategoryTreeNode


async def category_tree(
    db: AsyncSession, *, include_inactive: bool = False
) -> list[CategoryTreeNode]:
    """The catalogue as service types with their services nested beneath."""
    stmt = select(RequestCategory).order_by(RequestCategory.name)
    if not include_inactive:
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


async def resolve_service(
    db: AsyncSession,
    *,
    service_id: int,
    service_type_id: int | None = None,
) -> RequestCategory:
    """Load the chosen service, verifying it is a usable leaf of its type.

    `service_type_id` is optional because the type is recoverable from the
    service's `parent_id`; when the client does send it, it must agree, which
    catches a stale form that mixes a type from one branch with a service from
    another.
    """
    service = (
        await db.execute(select(RequestCategory).where(RequestCategory.id == service_id))
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=400, detail="Tanlangan xizmat topilmadi")
    if not service.is_active:
        raise HTTPException(status_code=400, detail="Tanlangan xizmat faol emas")

    # A root row is a service type, not something a request can be filed under.
    if service.parent_id is None:
        raise HTTPException(
            status_code=400,
            detail="Xizmat turini emas, aniq xizmatni tanlang",
        )

    service_type = (
        await db.execute(select(RequestCategory).where(RequestCategory.id == service.parent_id))
    ).scalar_one_or_none()
    if service_type is None:
        raise HTTPException(status_code=400, detail="Xizmat turi topilmadi")
    if not service_type.is_active:
        raise HTTPException(status_code=400, detail="Tanlangan xizmat turi faol emas")

    if service_type_id is not None and service_type_id != service_type.id:
        raise HTTPException(
            status_code=400,
            detail="Tanlangan xizmat ushbu xizmat turiga tegishli emas",
        )

    return service
