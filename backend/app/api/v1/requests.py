from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_redis_dep
from app.core.db import get_db
from app.core.security import get_current_user, require_roles
from app.models import Message, RequestFile, Role, User
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
    RequestSummary,
    RequestTransition,
)
from app.services.audit_service import log_action
from app.services.file_service import resolve_stored_path, save_upload
from app.services.notification_service import create_notification, enqueue_email
from app.services.request_service import (
    assign_request,
    create_request,
    get_request_for_user,
    reload_detail,
    transition_request,
)

router = APIRouter(prefix="/requests", tags=["requests"])


def _sees_internal(user: User) -> bool:
    return user.has_role(*Role.SEES_INTERNAL)


async def _detail_for(db: AsyncSession, request_id: int, user: User) -> RequestDetail:
    req = await reload_detail(db, request_id)
    return RequestDetail.for_viewer(req, include_internal=_sees_internal(user))


@router.post("", response_model=RequestDetail, status_code=201)
async def create(
    data: RequestCreate,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
    user: User = Depends(get_current_user),
) -> RequestDetail:
    if not user.has_role(Role.STUDENT):
        raise HTTPException(status_code=403, detail="Faqat talabalar murojaat yubora oladi")

    req = await create_request(
        db,
        redis,
        student=user,
        category_id=data.category_id,
        service_type_id=data.service_type_id,
        title=data.title,
        description=data.description,
    )
    await log_action(
        db,
        user_id=user.id,
        action="request.create",
        entity_type="request",
        entity_id=req.id,
        new_value={
            "tracking_no": req.tracking_no,
            "title": req.title,
            "assigned_to": req.assigned_to,
            "auto_routed": True,
        },
    )

    # Routing always yields a handler — creation fails outright otherwise — so
    # the assignee is notified unconditionally and the request lands on their
    # dashboard straight away.
    assignee = await db.get(User, req.assigned_to)
    if assignee:
        await create_notification(
            db,
            user_id=assignee.id,
            type_=NotificationType.REQUEST_ASSIGNED,
            title=f"Yangi murojaat: {req.tracking_no}",
            body=f"Sizga '{req.title}' murojaati biriktirildi.",
            payload={"request_id": req.id, "tracking_no": req.tracking_no},
        )
        if assignee.email:
            enqueue_email(
                assignee.email,
                f"ROYD: Yangi murojaat {req.tracking_no}",
                f"Sizga '{req.title}' murojaati biriktirildi. Tracking: {req.tracking_no}",
            )

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
        filters.append(RequestModel.status.in_(RequestStatus.OPEN))
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

    assignee = await db.get(User, data.assignee_id)
    if assignee:
        await create_notification(
            db,
            user_id=assignee.id,
            type_=NotificationType.REQUEST_ASSIGNED,
            title=f"Yangi murojaat: {req.tracking_no}",
            body=f"Sizga '{req.title}' murojaati biriktirildi.",
            payload={"request_id": req.id, "tracking_no": req.tracking_no},
        )
        if assignee.email:
            enqueue_email(
                assignee.email,
                f"ROYD: Yangi murojaat {req.tracking_no}",
                f"Sizga '{req.title}' murojaati biriktirildi. Tracking: {req.tracking_no}",
            )

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

    await create_notification(
        db,
        user_id=req.student_id,
        type_=NotificationType.REQUEST_STATUS,
        title=f"Murojaat holati: {req.tracking_no}",
        body=f"Holati o'zgardi: {old_status} → {data.status}",
        payload={"request_id": req.id, "tracking_no": req.tracking_no, "status": data.status},
    )
    student = await db.get(User, req.student_id)
    if student and student.email:
        enqueue_email(
            student.email,
            f"ROYD: Murojaat {req.tracking_no} holati o'zgardi",
            f"Murojaatingiz holati: {data.status}. {data.comment or ''}",
        )

    await db.commit()
    return await _detail_for(db, req.id, actor)


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

    msg = Message(
        request_id=req.id,
        sender_id=user.id,
        content=data.content.strip(),
        is_internal=data.is_internal,
    )
    db.add(msg)
    await db.flush()

    if not data.is_internal:
        recipients: set[int] = set()
        if user.id != req.student_id:
            recipients.add(req.student_id)
        if req.assigned_to and req.assigned_to != user.id:
            recipients.add(req.assigned_to)
        for rid in recipients:
            await create_notification(
                db,
                user_id=rid,
                type_=NotificationType.REQUEST_MESSAGE,
                title=f"Yangi xabar: {req.tracking_no}",
                body=data.content[:200],
                payload={"request_id": req.id, "tracking_no": req.tracking_no},
            )

    await db.commit()
    await db.refresh(msg)
    out = MessageOut.model_validate(msg)
    # The sender is the caller, so name the author without another round trip.
    out.sender_name = user.full_name
    out.sender_role = user.role_name
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

    meta = await save_upload(upload, request_id=req.id, uploader_id=user.id)
    record = RequestFile(request_id=req.id, uploaded_by=user.id, **meta)
    db.add(record)
    await log_action(
        db,
        user_id=user.id,
        action="request.file_upload",
        entity_type="request",
        entity_id=req.id,
        new_value={"file_name": meta["file_name"], "size": meta["file_size"]},
    )
    await db.commit()
    await db.refresh(record)
    return RequestFileOut.model_validate(record)


@router.get("/{request_id}/files/{file_id}")
async def download_file(
    request_id: int,
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    req = await get_request_for_user(db, request_id, user, with_details=False)
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
