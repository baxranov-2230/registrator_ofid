from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Request, RequestCategory, RequestHistory, User
from app.models.request import RequestStatus
from app.models.role import Role


_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    RequestStatus.NEW: {RequestStatus.ACCEPTED, RequestStatus.REJECTED, RequestStatus.RETURNED},
    RequestStatus.ACCEPTED: {
        RequestStatus.IN_PROGRESS,
        RequestStatus.REJECTED,
        RequestStatus.RETURNED,
    },
    RequestStatus.IN_PROGRESS: {
        RequestStatus.COMPLETED,
        RequestStatus.REJECTED,
        RequestStatus.RETURNED,
    },
    RequestStatus.RETURNED: {RequestStatus.ACCEPTED, RequestStatus.NEW},
    RequestStatus.COMPLETED: set(),
    RequestStatus.REJECTED: set(),
}


async def generate_tracking_no(redis: Redis) -> str:
    year = datetime.now(UTC).year
    key = f"tracking_seq:{year}"
    seq = await redis.incr(key)
    if seq == 1:
        await redis.expire(key, 60 * 60 * 24 * 366)
    return f"REQ-{year}-{seq:05d}"


async def create_request(
    db: AsyncSession,
    redis: Redis,
    *,
    student: User,
    category_id: int,
    title: str,
    description: str,
) -> Request:
    cat_stmt = select(RequestCategory).where(RequestCategory.id == category_id)
    category = (await db.execute(cat_stmt)).scalar_one_or_none()
    if not category or not category.is_active:
        raise HTTPException(status_code=400, detail="Invalid category")

    tracking_no = await generate_tracking_no(redis)
    sla_deadline = datetime.now(UTC) + timedelta(hours=category.sla_hours)

    req = Request(
        tracking_no=tracking_no,
        student_id=student.id,
        category_id=category.id,
        title=title.strip(),
        description=description.strip(),
        status=RequestStatus.NEW,
        priority=category.priority,
        faculty_id=student.faculty_id,
        department_id=student.department_id,
        sla_deadline=sla_deadline,
    )
    db.add(req)
    await db.flush()

    db.add(
        RequestHistory(
            request_id=req.id,
            changed_by=student.id,
            old_status=None,
            new_status=RequestStatus.NEW,
            comment="Created",
        )
    )
    await db.flush()
    return req


async def get_request_for_user(
    db: AsyncSession, request_id: int, user: User
) -> Request:
    stmt = (
        select(Request)
        .where(Request.id == request_id)
        .options(
            selectinload(Request.category),
            selectinload(Request.student),
            selectinload(Request.assignee),
            selectinload(Request.faculty),
            selectinload(Request.department),
            selectinload(Request.history),
            selectinload(Request.files),
            selectinload(Request.messages),
        )
    )
    req = (await db.execute(stmt)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    role = user.role.name if user.role else None
    if role == Role.STUDENT and req.student_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if role == Role.STAFF and req.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return req


async def assign_request(
    db: AsyncSession,
    *,
    req: Request,
    actor: User,
    assignee_id: int,
    faculty_id: int | None,
    department_id: int | None,
    comment: str | None = None,
) -> Request:
    assignee_stmt = select(User).where(User.id == assignee_id).options(selectinload(User.role))
    assignee = (await db.execute(assignee_stmt)).scalar_one_or_none()
    if not assignee or not assignee.is_active:
        raise HTTPException(status_code=400, detail="Invalid assignee")
    if assignee.role and assignee.role.name not in (Role.STAFF, Role.REGISTRATOR):
        raise HTTPException(status_code=400, detail="Assignee must be staff or registrator")

    req.assigned_to = assignee.id
    if faculty_id is not None:
        req.faculty_id = faculty_id
    if department_id is not None:
        req.department_id = department_id

    db.add(
        RequestHistory(
            request_id=req.id,
            changed_by=actor.id,
            old_status=req.status,
            new_status=req.status,
            comment=comment or f"Assigned to {assignee.full_name}",
        )
    )
    await db.flush()
    return req


async def transition_request(
    db: AsyncSession,
    *,
    req: Request,
    actor: User,
    new_status: str,
    comment: str | None,
) -> Request:
    if new_status not in RequestStatus.ALL:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    allowed = _ALLOWED_TRANSITIONS.get(req.status, set())
    role = actor.role.name if actor.role else None

    if new_status == RequestStatus.RETURNED and role not in (Role.REGISTRATOR, Role.ADMIN):
        raise HTTPException(status_code=403, detail="Only registrator can return")

    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition from {req.status} to {new_status}",
        )

    if role == Role.STAFF:
        if req.assigned_to != actor.id:
            raise HTTPException(status_code=403, detail="Not your request")
        if new_status in (RequestStatus.RETURNED,):
            raise HTTPException(status_code=403, detail="Forbidden")

    old = req.status
    req.status = new_status
    if new_status in RequestStatus.CLOSED:
        req.closed_at = datetime.now(UTC)

    db.add(
        RequestHistory(
            request_id=req.id,
            changed_by=actor.id,
            old_status=old,
            new_status=new_status,
            comment=comment,
        )
    )
    await db.flush()
    return req
