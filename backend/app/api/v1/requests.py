from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_redis_dep
from app.core.db import get_db
from app.core.security import get_current_user, require_roles
from app.models import ApiClient, Message, RequestFile, Role, User
from app.models import Request as RequestModel
from app.models.notification import NotificationType
from app.models.request import RequestStatus
from app.schemas.request import (
    MessageCreate,
    MessageOut,
    Page,
    RequestAssign,
    RequestCreate,
    RequestDetail,
    RequestFileOut,
    RequestResubmit,
    RequestSummary,
    RequestTransition,
)
from app.services import events
from app.services.audit_service import log_action
from app.services.email_templates import render, request_link
from app.services.file_service import resolve_stored_path, save_upload
from app.services.labels import status_label
from app.services.notification_service import create_notification
from app.services.outbox_service import enqueue_email
from app.services.request_service import (
    assert_open,
    assign_request,
    create_request,
    find_by_client_ref,
    get_request_for_user,
    reload_detail,
    resubmit_request,
    transition_request,
)

router = APIRouter(prefix="/requests", tags=["requests"])


def _sees_internal(user: User) -> bool:
    return user.has_role(*Role.SEES_INTERNAL)


async def _detail_for(db: AsyncSession, request_id: int, user: User) -> RequestDetail:
    req = await reload_detail(db, request_id)
    return RequestDetail.for_viewer(req, include_internal=_sees_internal(user))


async def _notify_user(
    db: AsyncSession,
    user_id: int,
    *,
    type_: str,
    title: str,
    lines: list[str],
    req: RequestModel,
    link_base: str = "/registrator/requests",
    email: bool = True,
) -> None:
    """In-app notification plus, when the user has an address, an email."""
    await create_notification(
        db,
        user_id=user_id,
        type_=type_,
        title=title,
        body=" ".join(lines)[:500],
        payload={"request_id": req.id, "tracking_no": req.tracking_no},
    )
    if not email:
        return
    recipient = await db.get(User, user_id)
    if recipient and recipient.email:
        text, html = render(title, lines, request_link(req.id, link_base))
        await enqueue_email(db, recipient.email, title, text, html)


async def _notify_assigned(db: AsyncSession, req: RequestModel, assignee_id: int) -> None:
    assignee = await db.get(User, assignee_id)
    if assignee is None:
        return
    base = "/staff/requests" if assignee.has_role(Role.STAFF) else "/registrator/requests"
    await _notify_user(
        db,
        assignee.id,
        type_=NotificationType.REQUEST_ASSIGNED,
        title=f"Yangi murojaat: {req.tracking_no}",
        lines=[f"Sizga '{req.title}' murojaati biriktirildi."],
        req=req,
        link_base=base,
    )


# ── Student-side actions ────────────────────────────────────────────────────
# Shared by the routes below and by the API-client routes in integration.py,
# which act on the student's behalf. Each one audits, notifies and publishes
# the webhook event; the caller does the single commit.


async def file_request(
    db: AsyncSession,
    redis: Redis,
    *,
    student: User,
    data: RequestCreate,
    client_ref: str | None,
    api_client: ApiClient | None = None,
) -> RequestModel:
    req = await create_request(
        db,
        redis,
        student=student,
        category_id=data.category_id,
        service_type_id=data.service_type_id,
        title=data.title,
        description=data.description,
        client_ref=client_ref,
        api_client_id=api_client.id if api_client else None,
    )
    await log_action(
        db,
        user_id=student.id,
        action="request.create",
        entity_type="request",
        entity_id=req.id,
        new_value={
            "tracking_no": req.tracking_no,
            "title": req.title,
            "assigned_to": req.assigned_to,
            "auto_routed": True,
            **({"api_client": api_client.client_id} if api_client else {}),
        },
    )

    # Routing always yields a handler — creation fails outright otherwise — so
    # the assignee is notified unconditionally and the request lands on their
    # dashboard straight away.
    if req.assigned_to:
        await _notify_assigned(db, req, req.assigned_to)
    await events.publish(db, events.REQUEST_CREATED, req)
    return req


async def resubmit_returned(
    db: AsyncSession, req: RequestModel, student: User, comment: str | None
) -> None:
    await resubmit_request(db, req=req, student=student, comment=comment)
    await log_action(
        db,
        user_id=student.id,
        action="request.resubmit",
        entity_type="request",
        entity_id=req.id,
        old_value={"status": RequestStatus.RETURNED},
        new_value={"status": req.status},
    )
    if req.assigned_to:
        await _notify_user(
            db,
            req.assigned_to,
            type_=NotificationType.REQUEST_STATUS,
            title=f"Murojaat qayta yuborildi: {req.tracking_no}",
            lines=[
                f"Talaba '{req.title}' murojaatini to'ldirib qayta yubordi.",
                *([f"Izoh: {comment}"] if comment else []),
            ],
            req=req,
        )
    await events.publish(
        db,
        events.REQUEST_STATUS_CHANGED,
        req,
        old_status=RequestStatus.RETURNED,
        comment=comment,
    )


async def post_message(
    db: AsyncSession, req: RequestModel, sender: User, *, content: str, is_internal: bool
) -> MessageOut:
    msg = Message(
        request_id=req.id,
        sender_id=sender.id,
        content=content.strip(),
        is_internal=is_internal,
    )
    db.add(msg)
    await db.flush()

    if not is_internal:
        recipients: set[int] = set()
        if sender.id != req.student_id:
            recipients.add(req.student_id)
        if req.assigned_to and req.assigned_to != sender.id:
            recipients.add(req.assigned_to)
        for rid in recipients:
            await create_notification(
                db,
                user_id=rid,
                type_=NotificationType.REQUEST_MESSAGE,
                title=f"Yangi xabar: {req.tracking_no}",
                body=content[:200],
                payload={"request_id": req.id, "tracking_no": req.tracking_no},
            )
        await events.publish(
            db,
            events.REQUEST_MESSAGE_CREATED,
            req,
            message={
                "id": msg.id,
                "content": msg.content,
                "sender_name": sender.full_name,
                "sender_role": sender.role_name,
                "from_student": sender.id == req.student_id,
            },
        )

    out = MessageOut.model_validate(msg)
    # The sender is the caller, so name the author without another round trip.
    out.sender_name = sender.full_name
    out.sender_role = sender.role_name
    return out


async def attach_file(
    db: AsyncSession, req: RequestModel, uploader: User, upload: UploadFile
) -> RequestFileOut:
    meta = await save_upload(upload, request_id=req.id, uploader_id=uploader.id)
    record = RequestFile(request_id=req.id, uploaded_by=uploader.id, **meta)
    db.add(record)
    await db.flush()
    await log_action(
        db,
        user_id=uploader.id,
        action="request.file_upload",
        entity_type="request",
        entity_id=req.id,
        new_value={"file_name": meta["file_name"], "size": meta["file_size"]},
    )
    await events.publish(
        db,
        events.REQUEST_FILE_ADDED,
        req,
        file={
            "id": record.id,
            "file_name": record.file_name,
            "file_size": record.file_size,
            "mime_type": record.mime_type,
            "from_student": uploader.id == req.student_id,
        },
    )
    return RequestFileOut.model_validate(record)


async def stored_file_response(db: AsyncSession, req: RequestModel, file_id: int) -> FileResponse:
    f = (
        await db.execute(
            select(RequestFile).where(RequestFile.id == file_id, RequestFile.request_id == req.id)
        )
    ).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Fayl topilmadi")

    path = resolve_stored_path(f.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Fayl diskda topilmadi")

    return FileResponse(
        path,
        media_type=f.mime_type,
        filename=f.file_name,
        # Never let the browser render an upload inline in our own origin.
        headers={"X-Content-Type-Options": "nosniff", "Content-Disposition": "attachment"},
    )


@router.post("", response_model=RequestDetail, status_code=201)
async def create(
    data: RequestCreate,
    response: Response,
    idempotency_key: str | None = Header(
        default=None,
        alias="Idempotency-Key",
        min_length=1,
        max_length=64,
        description=(
            "Client-chosen key for this submission. Repeating a POST with the same key "
            "returns the request created the first time (200) instead of a duplicate."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
    user: User = Depends(get_current_user),
) -> RequestDetail:
    if not user.has_role(Role.STUDENT):
        raise HTTPException(status_code=403, detail="Faqat talabalar murojaat yubora oladi")

    # A partner platform retrying after a timeout must not file twice.
    if idempotency_key:
        existing = await find_by_client_ref(db, user.id, idempotency_key)
        if existing is not None:
            response.status_code = 200
            return await _detail_for(db, existing.id, user)

    req = await file_request(db, redis, student=user, data=data, client_ref=idempotency_key)
    await db.commit()
    return await _detail_for(db, req.id, user)


@router.get("", response_model=Page[RequestSummary])
async def list_requests(
    status: str | None = Query(default=None),
    faculty_id: int | None = None,
    category_id: int | None = None,
    assigned_to: int | None = None,
    unassigned: bool | None = None,
    overdue: bool | None = None,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page[RequestSummary]:
    if status is not None and status not in RequestStatus.ALL:
        raise HTTPException(status_code=422, detail=f"Noma'lum holat: {status}")

    filters = []
    role = user.role_name
    if role == Role.STUDENT:
        filters.append(RequestModel.student_id == user.id)
    elif role == Role.STAFF:
        filters.append(RequestModel.assigned_to == user.id)

    if status:
        filters.append(RequestModel.status == status)
    if faculty_id is not None:
        filters.append(RequestModel.faculty_id == faculty_id)
    if category_id is not None:
        filters.append(RequestModel.category_id == category_id)
    if assigned_to is not None:
        filters.append(RequestModel.assigned_to == assigned_to)
    if unassigned:
        # The registrator's core triage question: what still needs an owner?
        filters.append(RequestModel.assigned_to.is_(None))
    if overdue:
        # Returned requests wait on the student; their clock is stopped.
        filters.append(RequestModel.status.in_(RequestStatus.SLA_RUNNING))
        filters.append(RequestModel.sla_deadline < func.now())
    if search:
        like = f"%{search}%"
        filters.append(
            RequestModel.title.ilike(like)
            | RequestModel.description.ilike(like)
            | RequestModel.tracking_no.ilike(like)
        )

    # Total is what lets the client build real pagination controls (C-06).
    total = (
        await db.execute(select(func.count()).select_from(RequestModel).where(*filters))
    ).scalar_one()

    rows = (
        (
            await db.execute(
                select(RequestModel)
                .where(*filters)
                .order_by(RequestModel.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )

    return Page[RequestSummary](
        items=[RequestSummary.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{request_id}", response_model=RequestDetail)
async def get_detail(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RequestDetail:
    req = await get_request_for_user(db, request_id, user)
    return RequestDetail.for_viewer(req, include_internal=_sees_internal(user))


@router.post("/{request_id}/assign", response_model=RequestDetail)
async def assign(
    request_id: int,
    data: RequestAssign,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*Role.CAN_TRIAGE)),
) -> RequestDetail:
    # No eager loads: this path mutates and then re-reads once (D-04).
    req = await get_request_for_user(db, request_id, actor, with_details=False)
    await assign_request(
        db,
        req=req,
        actor=actor,
        assignee_id=data.assignee_id,
        faculty_id=data.faculty_id,
        department_id=data.department_id,
        comment=data.comment,
    )
    await log_action(
        db,
        user_id=actor.id,
        action="request.assign",
        entity_type="request",
        entity_id=req.id,
        new_value={"assignee_id": data.assignee_id},
    )
    await _notify_assigned(db, req, data.assignee_id)

    await db.commit()
    return await _detail_for(db, req.id, actor)


@router.post("/{request_id}/transition", response_model=RequestDetail)
async def transition(
    request_id: int,
    data: RequestTransition,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*Role.CAN_TRANSITION)),
) -> RequestDetail:
    req = await get_request_for_user(db, request_id, actor, with_details=False)
    old_status = req.status
    await transition_request(db, req=req, actor=actor, new_status=data.status, comment=data.comment)
    await log_action(
        db,
        user_id=actor.id,
        action="request.transition",
        entity_type="request",
        entity_id=req.id,
        old_value={"status": old_status},
        new_value={"status": data.status},
    )

    lines = [
        f"Murojaatingiz holati o'zgardi: {status_label(old_status)} → {status_label(data.status)}."
    ]
    if data.comment:
        lines.append(f"Izoh: {data.comment}")
    await _notify_user(
        db,
        req.student_id,
        type_=NotificationType.REQUEST_STATUS,
        title=f"Murojaat holati: {req.tracking_no}",
        lines=lines,
        req=req,
        link_base="/student/requests",
    )
    await events.publish(
        db,
        events.REQUEST_STATUS_CHANGED,
        req,
        old_status=old_status,
        comment=data.comment,
    )

    await db.commit()
    return await _detail_for(db, req.id, actor)


@router.post("/{request_id}/resubmit", response_model=RequestDetail)
async def resubmit(
    request_id: int,
    data: RequestResubmit,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_roles(Role.STUDENT)),
) -> RequestDetail:
    """Send a returned request back to the office after supplying what was asked.

    Returning used to be a dead end: only staff could move a request out of
    `returned`, so the student could add files and messages but never say
    "done". This moves it back to `new` and restarts the paused SLA clock.
    """
    req = await get_request_for_user(db, request_id, student, with_details=False)
    await resubmit_returned(db, req, student, data.comment)
    await db.commit()
    return await _detail_for(db, req.id, student)


@router.post("/{request_id}/messages", response_model=MessageOut, status_code=201)
async def add_message(
    request_id: int,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    req = await get_request_for_user(db, request_id, user, with_details=False)

    if user.has_role(*Role.READ_ONLY):
        raise HTTPException(status_code=403, detail="Rahbariyat roli faqat ko'rish huquqiga ega")
    if data.is_internal and not _sees_internal(user):
        raise HTTPException(status_code=403, detail="Talabalar ichki eslatma yoza olmaydi")
    # Staff may still leave internal notes on a closed request; the
    # conversation with the student, however, is over.
    if not data.is_internal:
        assert_open(req)

    out = await post_message(db, req, user, content=data.content, is_internal=data.is_internal)
    await db.commit()
    return out


@router.post("/{request_id}/files", response_model=RequestFileOut, status_code=201)
async def upload_file(
    request_id: int,
    upload: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RequestFileOut:
    req = await get_request_for_user(db, request_id, user, with_details=False)
    if user.has_role(*Role.READ_ONLY):
        raise HTTPException(status_code=403, detail="Rahbariyat roli faqat ko'rish huquqiga ega")
    assert_open(req)

    out = await attach_file(db, req, user, upload)
    await db.commit()
    return out


@router.get("/{request_id}/files/{file_id}")
async def download_file(
    request_id: int,
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    req = await get_request_for_user(db, request_id, user, with_details=False)
    return await stored_file_response(db, req, file_id)
