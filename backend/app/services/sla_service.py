"""SLA deadline monitoring (C-04).

`sla_deadline` was written on every request and indexed, but nothing ever read
it — no escalation, no reminder, no report. This closes that loop: a periodic
sweep finds open requests past their deadline and notifies the assignee plus
the registrators, once per request.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import SessionLocal
from app.models import Request, Role, User
from app.models.notification import NotificationType
from app.models.request import RequestStatus
from app.services.notification_service import create_notification, enqueue_email

log = logging.getLogger(__name__)

# Warn before the deadline as well, so staff can still act on it.
WARNING_THRESHOLD = timedelta(hours=4)


async def _registrator_ids(db: AsyncSession) -> list[int]:
    rows = await db.execute(
        select(User.id).join(Role).where(Role.name == Role.REGISTRATOR, User.is_active.is_(True))
    )
    return list(rows.scalars().all())


async def _notify_once(db: AsyncSession, req: Request, *, breached: bool) -> None:
    """Send the breach/warning notification, guarding against repeats.

    The marker lives in RequestHistory rather than a new column so this needed
    no migration; `comment` carries a stable sentinel we can look for.
    """
    marker = "[sla-breach]" if breached else "[sla-warning]"
    already = any(h.comment and marker in h.comment for h in req.history)
    if already:
        return

    hours_late = int((datetime.now(UTC) - req.sla_deadline).total_seconds() // 3600)
    if breached:
        title = f"SLA buzildi: {req.tracking_no}"
        body = f"'{req.title}' murojaati muddatidan {hours_late} soat o'tdi."
    else:
        title = f"SLA muddati yaqin: {req.tracking_no}"
        body = f"'{req.title}' murojaati muddati tez orada tugaydi."

    recipients = set(await _registrator_ids(db))
    if req.assigned_to:
        recipients.add(req.assigned_to)

    for user_id in recipients:
        await create_notification(
            db,
            user_id=user_id,
            type_=NotificationType.SYSTEM,
            title=title,
            body=body,
            payload={
                "request_id": req.id,
                "tracking_no": req.tracking_no,
                "sla_breached": breached,
            },
        )

    if breached and req.assigned_to:
        assignee = await db.get(User, req.assigned_to)
        if assignee and assignee.email:
            enqueue_email(assignee.email, title, body)

    from app.models import RequestHistory

    db.add(
        RequestHistory(
            request_id=req.id,
            changed_by=None,
            old_status=req.status,
            new_status=req.status,
            comment=f"{marker} {body}",
        )
    )


async def sweep_sla_deadlines() -> dict[str, int]:
    """One pass over open requests. Returns counts for logging/tests."""
    now = datetime.now(UTC)
    breached = warned = 0

    async with SessionLocal() as db:
        stmt = (
            select(Request)
            .where(
                Request.status.in_(RequestStatus.OPEN),
                Request.sla_deadline < now + WARNING_THRESHOLD,
            )
            .options(selectinload(Request.history))
            .order_by(Request.sla_deadline)
            .limit(500)
        )
        for req in (await db.execute(stmt)).scalars().all():
            is_breached = req.sla_deadline < now
            await _notify_once(db, req, breached=is_breached)
            if is_breached:
                breached += 1
            else:
                warned += 1
        await db.commit()

    if breached or warned:
        log.info("SLA sweep: %d breached, %d approaching", breached, warned)
    return {"breached": breached, "warned": warned}
