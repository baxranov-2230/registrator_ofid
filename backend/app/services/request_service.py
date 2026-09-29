import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Message, Request, RequestCategory, RequestHistory, User
from app.models.request import RequestStatus
from app.models.role import Role
from app.services.catalog_service import resolve_service
from app.services.labels import status_label
from app.services.routing_service import resolve_handler_for_student
from app.services.sla_calendar import add_working_time, sla_deadline_from, working_time_between

log = logging.getLogger(__name__)


#: Moves a handler can make with `/transition`. None of them closes a request:
#: that happens only through a final answer (`answer_request`), so accepting,
#: returning or rejecting can never stand in for the outcome. `accepted` is a
#: legacy state; its rows are picked up the same way as `new` ones.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    RequestStatus.NEW: {RequestStatus.IN_PROGRESS, RequestStatus.RETURNED},
    RequestStatus.ACCEPTED: {RequestStatus.IN_PROGRESS, RequestStatus.RETURNED},
    RequestStatus.IN_PROGRESS: {RequestStatus.RETURNED},
    RequestStatus.RETURNED: {RequestStatus.IN_PROGRESS},
    RequestStatus.COMPLETED: set(),
    RequestStatus.REJECTED: set(),
}

#: Transitions that must say why. A returned student has to know what to fix
#: (Reglament 6.2).
_COMMENT_REQUIRED = {RequestStatus.RETURNED}


def _aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def assert_open(req: Request) -> None:
    """Refuse changes to a request that has been completed or rejected."""
    if req.status in RequestStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Murojaat yopilgan, unga o'zgartirish kiritib bo'lmaydi",
        )


async def find_by_client_ref(db: AsyncSession, student_id: int, client_ref: str) -> Request | None:
    return (
        await db.execute(
            select(Request).where(
                Request.student_id == student_id, Request.client_ref == client_ref
            )
        )
    ).scalar_one_or_none()


async def generate_tracking_no(db: AsyncSession, redis: Redis) -> str:
    """Next tracking number for the current year.

    Redis holds the counter for speed, but it is not the source of truth: if it
    has been flushed or lost its volume the counter restarts at 1 and every
    insert collides with the unique index. So on a cold counter we seed it from
    the highest number already in the database (D-02).
    """
    year = datetime.now(UTC).year
    key = f"tracking_seq:{year}"

    seq = await redis.incr(key)
    if seq == 1:
        highest = (
            await db.execute(
                select(func.max(Request.tracking_no)).where(
                    Request.tracking_no.like(f"REQ-{year}-%")
                )
            )
        ).scalar_one_or_none()
        if highest:
            try:
                recovered = int(highest.rsplit("-", 1)[1])
                await redis.set(key, recovered + 1)
                seq = recovered + 1
            except (ValueError, IndexError):
                log.warning("Could not parse tracking number %r while reseeding", highest)
        await redis.expire(key, 60 * 60 * 24 * 366)

    return f"REQ-{year}-{seq:05d}"


async def _resolve_assignee(db: AsyncSession, assignee_id: int) -> User:
    """Validate that a user may receive a request assignment."""
    stmt = select(User).where(User.id == assignee_id).options(selectinload(User.role))
    assignee = (await db.execute(stmt)).scalar_one_or_none()
    if not assignee or not assignee.is_active:
        raise HTTPException(status_code=400, detail="Mas'ul xodim topilmadi yoki faol emas")
    if not assignee.has_role(Role.STAFF, Role.REGISTRATOR):
        raise HTTPException(
            status_code=400, detail="Mas'ul faqat xodim yoki registrator bo'lishi mumkin"
        )
    return assignee


async def create_request(
    db: AsyncSession,
    redis: Redis,
    *,
    student: User,
    category_id: int,
    title: str,
    description: str,
    service_type_id: int | None = None,
    client_ref: str | None = None,
    api_client_id: int | None = None,
) -> Request:
    category = await resolve_service(db, service_type_id=service_type_id, service_id=category_id)

    # The student does not choose a handler. Routing is decided by their
    # faculty and department, and refuses rather than guessing when nobody is
    # bound to them.
    assignee = await resolve_handler_for_student(db, student)

    tracking_no = await generate_tracking_no(db, redis)
    # Working days only, per Reglament 7.3.
    sla_deadline = sla_deadline_from(datetime.now(UTC), category.sla_hours)

    req = Request(
        tracking_no=tracking_no,
        student_id=student.id,
        category_id=category.id,
        title=title.strip(),
        description=description.strip(),
        # Routed on submission, so the handler owns it from the first moment.
        status=RequestStatus.IN_PROGRESS,
        priority=category.priority,
        assigned_to=assignee.id,
        faculty_id=student.faculty_id,
        department_id=student.department_id,
        sla_deadline=sla_deadline,
        client_ref=client_ref,
        api_client_id=api_client_id,
    )
    db.add(req)
    await db.flush()

    # Two entries, so the timeline reads "filed" then "routed" — the same
    # new → in_progress steps the status line shows.
    db.add(
        RequestHistory(
            request_id=req.id,
            changed_by=student.id,
            old_status=None,
            new_status=RequestStatus.NEW,
            comment="Murojaat yuborildi",
        )
    )
    await db.flush()
    db.add(
        RequestHistory(
            request_id=req.id,
            changed_by=None,
            old_status=RequestStatus.NEW,
            new_status=RequestStatus.IN_PROGRESS,
            comment=f"Avtomatik yo'naltirildi. Mas'ul xodim: {assignee.full_name}",
        )
    )
    await db.flush()
    return req


_DETAIL_LOADS = (
    # The category's parent is the service type, surfaced on the detail payload.
    selectinload(Request.category).selectinload(RequestCategory.parent),
    selectinload(Request.student),
    selectinload(Request.assignee),
    selectinload(Request.answerer),
    selectinload(Request.faculty),
    selectinload(Request.department),
    # The actors are loaded with their rows so the detail payload can name them
    # instead of exposing raw user ids to the client.
    selectinload(Request.history).selectinload(RequestHistory.user),
    selectinload(Request.files),
    selectinload(Request.messages).selectinload(Message.sender),
)


def _assert_can_view(req: Request, user: User) -> None:
    """Row-level visibility. Separate from the role gate on the endpoint."""
    role = user.role_name
    if role == Role.STUDENT and req.student_id != user.id:
        raise HTTPException(status_code=403, detail="Ruxsat yo'q")
    if role == Role.STAFF and req.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="Ruxsat yo'q")


async def get_request_for_user(
    db: AsyncSession, request_id: int, user: User, *, with_details: bool = True
) -> Request:
    """Load a request the caller is allowed to see.

    `with_details=False` skips the eight eager loads for callers that only need
    the row to mutate it — assign and transition were paying for the full graph
    twice per call (D-04).
    """
    stmt = select(Request).where(Request.id == request_id)
    if with_details:
        stmt = stmt.options(*_DETAIL_LOADS)

    req = (await db.execute(stmt)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Murojaat topilmadi")

    _assert_can_view(req, user)
    return req


async def reload_detail(db: AsyncSession, request_id: int) -> Request:
    """Re-read a request with the full graph, for returning after a mutation."""
    stmt = select(Request).where(Request.id == request_id).options(*_DETAIL_LOADS)
    return (await db.execute(stmt)).scalar_one()


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
    if actor.role_name in Role.READ_ONLY:
        raise HTTPException(status_code=403, detail="Rahbariyat roli faqat ko'rish huquqiga ega")
    assert_open(req)

    assignee = await _resolve_assignee(db, assignee_id)
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
            comment=comment or f"Mas'ul xodim: {assignee.full_name}",
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
        raise HTTPException(status_code=400, detail=f"Noma'lum holat: {new_status}")

    allowed = _ALLOWED_TRANSITIONS.get(req.status, set())
    role = actor.role_name

    # Leadership has oversight, not operational control (A-02).
    if role in Role.READ_ONLY:
        raise HTTPException(status_code=403, detail="Rahbariyat roli faqat ko'rish huquqiga ega")

    if new_status == RequestStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Murojaat faqat «Javob berish» orqali yakuniy javob bilan yopiladi",
        )

    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"'{status_label(req.status)}' holatidan '{status_label(new_status)}' "
                "holatiga o'tib bo'lmaydi"
            ),
        )

    _assert_handler(req, actor)

    if new_status in _COMMENT_REQUIRED and not (comment or "").strip():
        raise HTTPException(status_code=422, detail="Qaytarish sababini izohda yozing")

    old = req.status
    _apply_status(req, new_status)

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


def _assert_handler(req: Request, actor: User) -> None:
    """Staff act only on requests assigned to them; triage roles on any."""
    if actor.role_name in Role.READ_ONLY:
        raise HTTPException(status_code=403, detail="Rahbariyat roli faqat ko'rish huquqiga ega")
    if actor.role_name == Role.STAFF and req.assigned_to != actor.id:
        raise HTTPException(status_code=403, detail="Bu sizning murojaatingiz emas")


def assert_can_answer(req: Request, actor: User) -> None:
    """Checks for "Javob berish", run before any answer file is written."""
    _assert_handler(req, actor)
    assert_open(req)


async def answer_request(db: AsyncSession, *, req: Request, actor: User, text: str) -> Request:
    """Record the final answer and close the request.

    This is the only way a request reaches `completed`. The answer's files are
    attached by the caller, flagged `is_answer`, before this runs.
    """
    assert_can_answer(req, actor)
    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Javob matnini yozing")

    old = req.status
    req.answer_text = text
    req.answered_at = datetime.now(UTC)
    req.answered_by = actor.id
    _apply_status(req, RequestStatus.COMPLETED)

    db.add(
        RequestHistory(
            request_id=req.id,
            changed_by=actor.id,
            old_status=old,
            new_status=RequestStatus.COMPLETED,
            comment="Yakuniy javob yuborildi",
        )
    )
    await db.flush()
    return req


def _apply_status(req: Request, new_status: str) -> None:
    """Change status and keep the SLA clock consistent with it.

    Returning a request hands it to the student, so the clock stops. When work
    resumes, the deadline moves out by exactly the working time that was left
    at the pause — the office is not charged for the time the student took.
    """
    now = datetime.now(UTC)

    if new_status == RequestStatus.RETURNED and req.sla_paused_at is None:
        req.sla_paused_at = now
    elif req.status == RequestStatus.RETURNED and new_status != RequestStatus.RETURNED:
        if req.sla_paused_at is not None:
            paused_at = _aware(req.sla_paused_at)
            remaining = working_time_between(paused_at, _aware(req.sla_deadline))
            if remaining.total_seconds() > 0:
                req.sla_deadline = add_working_time(now, remaining)
                # A new deadline deserves its own warning and breach notices.
                req.sla_warned_at = None
                req.sla_breached_at = None
        req.sla_paused_at = None

    req.status = new_status
    if new_status in RequestStatus.CLOSED:
        req.closed_at = now


async def resubmit_request(
    db: AsyncSession, *, req: Request, student: User, comment: str | None
) -> Request:
    """The student answers a return and sends the request back to the office."""
    if req.student_id != student.id:
        raise HTTPException(status_code=403, detail="Ruxsat yo'q")
    if req.status != RequestStatus.RETURNED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Faqat qaytarilgan murojaatni qayta yuborish mumkin",
        )
    # It goes back to the same handler, who picks up where they left off.
    _apply_status(req, RequestStatus.IN_PROGRESS)
    db.add(
        RequestHistory(
            request_id=req.id,
            changed_by=student.id,
            old_status=RequestStatus.RETURNED,
            new_status=RequestStatus.IN_PROGRESS,
            comment=comment or "Talaba murojaatni to'ldirib qayta yubordi",
        )
    )
    await db.flush()
    return req
