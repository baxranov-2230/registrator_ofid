"""Dashboard aggregates (C-01).

The dashboard shipped with every counter hardcoded to zero because no endpoint
existed to feed it. Each role sees the slice it is accountable for, computed in
one grouped query rather than one query per tile.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Request, Role, User
from app.models.request import RequestStatus


def _visible_requests(user: User) -> Select:
    """Base query scoped to what this role is allowed to count."""
    stmt = select(Request)
    role = user.role_name
    if role == Role.STUDENT:
        return stmt.where(Request.student_id == user.id)
    if role == Role.STAFF:
        return stmt.where(Request.assigned_to == user.id)
    return stmt


async def dashboard_stats(db: AsyncSession, user: User) -> dict:
    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    scoped = _visible_requests(user).subquery()

    # One pass for the per-status breakdown.
    status_rows = await db.execute(select(scoped.c.status, func.count()).group_by(scoped.c.status))
    by_status = {row[0]: row[1] for row in status_rows}

    total = sum(by_status.values())
    open_count = sum(by_status.get(s, 0) for s in RequestStatus.OPEN)

    overdue = (
        await db.execute(
            select(func.count())
            .select_from(scoped)
            .where(scoped.c.status.in_(RequestStatus.OPEN), scoped.c.sla_deadline < now)
        )
    ).scalar_one()

    due_soon = (
        await db.execute(
            select(func.count())
            .select_from(scoped)
            .where(
                scoped.c.status.in_(RequestStatus.OPEN),
                scoped.c.sla_deadline >= now,
                scoped.c.sla_deadline < now + timedelta(hours=24),
            )
        )
    ).scalar_one()

    completed_today = (
        await db.execute(
            select(func.count())
            .select_from(scoped)
            .where(scoped.c.status == RequestStatus.COMPLETED, scoped.c.closed_at >= today_start)
        )
    ).scalar_one()

    created_this_week = (
        await db.execute(
            select(func.count()).select_from(scoped).where(scoped.c.created_at >= week_ago)
        )
    ).scalar_one()

    # Average resolution time in hours, over closed requests only.
    avg_hours = (
        await db.execute(
            select(
                func.avg(func.extract("epoch", scoped.c.closed_at - scoped.c.created_at) / 3600.0)
            ).where(scoped.c.closed_at.is_not(None))
        )
    ).scalar_one()

    stats: dict = {
        "total": total,
        "open": open_count,
        "by_status": {s: by_status.get(s, 0) for s in RequestStatus.ALL},
        "overdue": overdue,
        "due_soon": due_soon,
        "completed_today": completed_today,
        "created_this_week": created_this_week,
        "avg_resolution_hours": round(float(avg_hours), 1) if avg_hours is not None else None,
        "sla_compliance_pct": None,
    }

    closed_total = sum(by_status.get(s, 0) for s in RequestStatus.CLOSED)
    if closed_total:
        breached = (
            await db.execute(
                select(func.count())
                .select_from(scoped)
                .where(
                    scoped.c.status.in_(RequestStatus.CLOSED),
                    scoped.c.closed_at > scoped.c.sla_deadline,
                )
            )
        ).scalar_one()
        stats["sla_compliance_pct"] = round(100 * (closed_total - breached) / closed_total, 1)

    # Admin and leadership also get organisation-wide headcount.
    if user.has_role(Role.ADMIN, Role.LEADERSHIP):
        stats["total_users"] = (
            await db.execute(select(func.count()).select_from(User).where(User.is_active.is_(True)))
        ).scalar_one()
        stats["unassigned"] = (
            await db.execute(
                select(func.count())
                .select_from(scoped)
                .where(scoped.c.assigned_to.is_(None), scoped.c.status.in_(RequestStatus.OPEN))
            )
        ).scalar_one()

    return stats
