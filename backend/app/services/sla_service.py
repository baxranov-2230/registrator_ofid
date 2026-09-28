"""SLA deadline monitoring (C-04, Reglament 7.2).

A periodic sweep finds requests whose SLA clock is running and that are near
or past their deadline, and notifies once per request per stage:

* warning (`sla_warning_hours` before the deadline) — the assignee;
* breach — the assignee, the registrators bound to the request's faculty, and
  the head of its department.

Each stage is recorded in its own column (`sla_warned_at`, `sla_breached_at`)
and the query excludes requests already at that stage. The sweep used to read
the whole history of the 500 oldest candidates and look for a sentinel
comment; once 500 requests were overdue the batch never changed and newer
breaches were never reported.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.locks import claim
from app.models import Department, Employee, Request, RequestHistory, Role, User
from app.models.notification import NotificationType
from app.models.request import RequestStatus
from app.services.email_templates import render, request_link
from app.services.notification_service import create_notification
from app.services.outbox_service import enqueue_email

log = logging.getLogger(__name__)

_BATCH = 200


def _aware(moment: datetime) -> datetime:
    """SQLite hands back naive datetimes; everything here compares in UTC."""
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


async def _faculty_registrator_ids(db: AsyncSession, faculty_id: int | None) -> set[int]:
    """Registrators responsible for the request's faculty.

    Falls back to every active registrator when the request has no faculty or
    no registrator is bound to it, so a breach is never reported to nobody.
    """
    base = select(User.id).join(Role).where(Role.name == Role.REGISTRATOR, User.is_active.is_(True))
    if faculty_id is not None:
        bound = (
            (
                await db.execute(
                    base.join(Employee, Employee.user_id == User.id).where(
                        Employee.faculty_id == faculty_id
                    )
                )
            )
            .scalars()
            .all()
        )
        if bound:
            return set(bound)
    return set((await db.execute(base)).scalars().all())


async def _department_head_id(db: AsyncSession, department_id: int | None) -> int | None:
    if department_id is None:
        return None
    return (
        await db.execute(select(Department.head_user_id).where(Department.id == department_id))
    ).scalar_one_or_none()


async def _notify(db: AsyncSession, req: Request, *, breached: bool, now: datetime) -> None:
    if breached:
        hours_late = int((now - _aware(req.sla_deadline)).total_seconds() // 3600)
        title = f"SLA buzildi: {req.tracking_no}"
        body = f"'{req.title}' murojaati muddatidan {hours_late} soat o'tdi."
        recipients = await _faculty_registrator_ids(db, req.faculty_id)
        head = await _department_head_id(db, req.department_id)
        if head:
            recipients.add(head)
    else:
        title = f"SLA muddati yaqin: {req.tracking_no}"
        body = f"'{req.title}' murojaati muddati tez orada tugaydi."
        recipients = set()
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

    # Email goes to the people who must act: the assignee always, and on a
    # breach everyone escalated to.
    emails = (
        (await db.execute(select(User.email).where(User.id.in_(recipients)))).scalars().all()
        if recipients
        else []
    )
    text, html = render(
        title,
        [body, f"Muddat: {_aware(req.sla_deadline):%Y-%m-%d %H:%M} (UTC)"],
        request_link(req.id),
    )
    for email in emails:
        if email:
            await enqueue_email(db, email, title, text, html)

    marker = "[sla-breach]" if breached else "[sla-warning]"
    db.add(
        RequestHistory(
            request_id=req.id,
            changed_by=None,
            old_status=req.status,
            new_status=req.status,
            comment=f"{marker} {body}",
        )
    )


async def sweep_sla_deadlines(*, use_lock: bool = True) -> dict[str, int]:
    """One pass over running requests. Returns counts for logging/tests."""
    if use_lock and not await claim("sla_sweep", settings.sla_check_interval_minutes * 60 - 5):
        return {"breached": 0, "warned": 0}

    now = datetime.now(UTC)
    warn_before = timedelta(hours=settings.sla_warning_hours)
    breached = warned = 0

    async with SessionLocal() as db:
        stmt = (
            select(Request)
            .where(
                Request.status.in_(RequestStatus.SLA_RUNNING),
                Request.sla_breached_at.is_(None),
                or_(
                    Request.sla_deadline < now,
                    (Request.sla_deadline < now + warn_before) & Request.sla_warned_at.is_(None),
                ),
            )
            .order_by(Request.sla_deadline)
            .limit(_BATCH)
        )
        for req in (await db.execute(stmt)).scalars().all():
            is_breached = _aware(req.sla_deadline) < now
            await _notify(db, req, breached=is_breached, now=now)
            if is_breached:
                req.sla_breached_at = now
                # A request that breaches before the first sweep sees it needs
                # no separate warning afterwards.
                req.sla_warned_at = req.sla_warned_at or now
                breached += 1
            else:
                req.sla_warned_at = now
                warned += 1
        await db.commit()

    if breached or warned:
        log.info("SLA sweep: %d breached, %d approaching", breached, warned)
    return {"breached": breached, "warned": warned}
