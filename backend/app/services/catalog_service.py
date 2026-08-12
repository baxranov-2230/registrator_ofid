"""Validation for the service-type → service selection on a new request.

The client narrows a 59-item list down to one service by first picking a type,
but that narrowing is a convenience, not a guarantee: a request can be posted
straight to the API. Every rule the form enforces is therefore re-checked here.
"""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RequestCategory


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
