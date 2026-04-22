from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import Notification, User
from app.schemas.notification import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[NotificationOut]:
    stmt = (
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    rows = (await db.execute(stmt)).scalars().all()
    return [NotificationOut.model_validate(r) for r in rows]


@router.patch("/{notif_id}/read", response_model=NotificationOut)
async def mark_read(
    notif_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationOut:
    notif = (
        await db.execute(
            select(Notification).where(
                Notification.id == notif_id, Notification.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    notif.read_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(notif)
    return NotificationOut.model_validate(notif)


@router.patch("/read-all", status_code=204)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True, read_at=datetime.now(UTC))
    )
    await db.commit()
    return None
