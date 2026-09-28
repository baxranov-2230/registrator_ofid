from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import require_roles
from app.models import AuditLog, Role, User
from app.schemas.audit import AuditLogOut
from app.schemas.request import Page

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get(
    "/audit",
    response_model=Page[AuditLogOut],
    dependencies=[Depends(require_roles(Role.ADMIN, Role.LEADERSHIP))],
)
async def list_audit(
    entity_type: str | None = None,
    entity_id: int | None = None,
    user_id: int | None = None,
    action: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> Page[AuditLogOut]:
    filters = []
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        filters.append(AuditLog.entity_id == entity_id)
    if user_id is not None:
        filters.append(AuditLog.user_id == user_id)
    if action:
        filters.append(AuditLog.action == action)

    total = (
        await db.execute(select(func.count()).select_from(AuditLog).where(*filters))
    ).scalar_one()
    rows = (
        (
            await db.execute(
                select(AuditLog)
                .where(*filters)
                .order_by(AuditLog.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    actor_ids = {r.user_id for r in rows if r.user_id is not None}
    names = (
        dict(
            (await db.execute(select(User.id, User.full_name).where(User.id.in_(actor_ids)))).all()
        )
        if actor_ids
        else {}
    )
    items = []
    for r in rows:
        item = AuditLogOut.model_validate(r)
        item.user_name = names.get(r.user_id) if r.user_id is not None else None
        items.append(item)
    return Page[AuditLogOut](
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )
