"""The two-level catalogue: request types with their service types beneath.

A request type ("Murojaat turi") is a root row carrying only a name and a
description. A service type ("Xizmat turi") is its child and carries what is
applied to a request filed under it: SLA, priority, routing, the answer an
automatic service sends (text, description and files) and — for general
issues — the employee who receives it. The admin rules that keep the tree at
exactly two levels live here.

The client narrows the list down to one service by first picking a type, but
that narrowing is a convenience, not a guarantee: a request can be posted
straight to the API. Every rule the form enforces is therefore re-checked here.
"""

from fastapi import HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AutoReplyFile, RequestCategory, Role, User
from app.models.category import ServiceRouting
from app.schemas.catalog import CategoryCreate, CategoryOut, CategoryTreeNode
from app.services.file_service import MAX_ANSWER_FILES, save_auto_reply_upload


def _clean(text: str | None) -> str | None:
    text = (text or "").strip()
    return text or None


async def _parent_request_type(
    db: AsyncSession, parent_id: int, *, moving: RequestCategory | None = None
) -> RequestCategory:
    """The request type a service type is placed under.

    Only a root may be a parent, so the tree never grows a third level.
    """
    if moving is not None and parent_id == moving.id:
        raise HTTPException(status_code=400, detail="Tur o'ziga ota bo'la olmaydi")
    parent = await db.get(RequestCategory, parent_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Murojaat turi topilmadi")
    if parent.parent_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Xizmat turi faqat murojaat turi ichida yaratiladi",
        )
    return parent


def _check_auto_reply(routing: str, auto_reply_text: str | None) -> None:
    """An auto-answered service must have something to answer with."""
    if routing == ServiceRouting.AUTO_REPLY and not _clean(auto_reply_text):
        raise HTTPException(
            status_code=422,
            detail="Avtomatik javob beriladigan xizmat turi uchun javob matnini kiriting",
        )


async def _check_assignee(db: AsyncSession, routing: str, assignee_id: int | None) -> None:
    """The employee chosen to receive a service's requests must be able to.

    Only a general-issues service takes one: the other routes pick the handler
    themselves, so an assignee there would be stored and silently ignored.
    Routing only ever hands requests to active staff and registrators, so
    anyone else would look like coverage while receiving nothing.
    """
    if assignee_id is None:
        return
    if routing != ServiceRouting.GENERAL_MANAGER:
        raise HTTPException(
            status_code=400,
            detail="Mas'ul xodim faqat «Umumiy masalalar menejeriga» yo'nalishida biriktiriladi",
        )
    role_name = (
        await db.execute(
            select(Role.name)
            .select_from(User)
            .join(Role)
            .where(User.id == assignee_id, User.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if role_name not in (Role.STAFF, Role.REGISTRATOR):
        raise HTTPException(
            status_code=400,
            detail="Mas'ul xodim faqat faol xodim yoki registrator bo'lishi mumkin",
        )


async def build_category(db: AsyncSession, data: CategoryCreate) -> RequestCategory:
    """A new request type, or a service type when `parent_id` names one."""
    if data.parent_id is None:
        # A request type is only a heading: name and description. SLA,
        # priority and routing belong to its service types.
        cat = RequestCategory(
            parent_id=None,
            name=data.name.strip(),
            description=_clean(data.description),
            icon=data.icon,
            is_active=True,
        )
    else:
        parent = await _parent_request_type(db, data.parent_id)
        _check_auto_reply(data.routing, data.auto_reply_text)
        await _check_assignee(db, data.routing, data.assignee_id)
        cat = RequestCategory(
            parent_id=parent.id,
            name=data.name.strip(),
            description=_clean(data.description),
            sla_hours=data.sla_hours,
            priority=data.priority,
            routing=data.routing,
            auto_reply_text=_clean(data.auto_reply_text),
            auto_reply_description=_clean(data.auto_reply_description),
            assignee_id=data.assignee_id,
            icon=data.icon,
            is_active=True,
        )
    db.add(cat)
    await db.flush()
    return cat


async def apply_category_update(db: AsyncSession, cat: RequestCategory, payload: dict) -> None:
    """Apply a partial update, keeping the tree at two levels.

    A service type may move to another request type, but neither kind may
    turn into the other: a request type's services would end up a level too
    deep, and a service's requests would be left without a type.
    """
    if "parent_id" in payload:
        new_parent = payload["parent_id"]
        if (new_parent is None) != (cat.parent_id is None):
            raise HTTPException(
                status_code=400,
                detail="Murojaat turini xizmat turiga yoki aksincha aylantirib bo'lmaydi",
            )
        if new_parent is not None:
            await _parent_request_type(db, new_parent, moving=cat)

    # These columns are NOT NULL; an explicit null means "leave it".
    for field in ("name", "sla_hours", "priority", "routing", "is_active"):
        if field in payload and payload[field] is None:
            del payload[field]
    for field in ("description", "auto_reply_text", "auto_reply_description"):
        if field in payload:
            payload[field] = _clean(payload[field])
    if "name" in payload and payload["name"] is not None:
        payload["name"] = payload["name"].strip()

    for field, value in payload.items():
        setattr(cat, field, value)

    if cat.parent_id is not None:
        _check_auto_reply(cat.routing, cat.auto_reply_text)
    if "assignee_id" in payload:
        await _check_assignee(db, cat.routing, cat.assignee_id)
    elif cat.routing != ServiceRouting.GENERAL_MANAGER:
        # Moving off general routing drops the chosen employee, so switching
        # back later does not quietly revive a stale choice.
        cat.assignee_id = None
    await db.flush()


async def list_auto_reply_files(db: AsyncSession, cat: RequestCategory) -> list[AutoReplyFile]:
    return list(
        (
            await db.execute(
                select(AutoReplyFile)
                .where(AutoReplyFile.category_id == cat.id)
                .order_by(AutoReplyFile.created_at, AutoReplyFile.id)
            )
        )
        .scalars()
        .all()
    )


async def add_auto_reply_file(
    db: AsyncSession, cat: RequestCategory, upload: UploadFile, uploader: User
) -> AutoReplyFile:
    """Attach a file to the answer an `auto_reply` service sends.

    Only such a service takes one: on any other route it would be stored and
    never sent. The answer as a whole keeps the cap a handler's answer has.
    """
    if cat.parent_id is None or cat.routing != ServiceRouting.AUTO_REPLY:
        raise HTTPException(
            status_code=400,
            detail="Fayl faqat «Avtomatik javob» yo'nalishidagi xizmat turiga biriktiriladi",
        )
    count = (
        await db.execute(
            select(func.count())
            .select_from(AutoReplyFile)
            .where(AutoReplyFile.category_id == cat.id)
        )
    ).scalar_one()
    if count >= MAX_ANSWER_FILES:
        raise HTTPException(
            status_code=422,
            detail=f"Javobga ko'pi bilan {MAX_ANSWER_FILES} ta fayl biriktiring",
        )
    meta = await save_auto_reply_upload(upload, category_id=cat.id)
    record = AutoReplyFile(category_id=cat.id, uploaded_by=uploader.id, **meta)
    db.add(record)
    await db.flush()
    return record


async def get_auto_reply_file(
    db: AsyncSession, cat: RequestCategory, file_id: int
) -> AutoReplyFile:
    record = (
        await db.execute(
            select(AutoReplyFile).where(
                AutoReplyFile.id == file_id, AutoReplyFile.category_id == cat.id
            )
        )
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Fayl topilmadi")
    return record


async def remove_auto_reply_file(
    db: AsyncSession, cat: RequestCategory, file_id: int
) -> AutoReplyFile:
    """Stop sending a file with the service's answer.

    Only the row goes. The bytes stay on disk: requests already answered point
    at them (`AutoReplyFile`).
    """
    record = await get_auto_reply_file(db, cat, file_id)
    await db.delete(record)
    await db.flush()
    return record


async def category_tree(
    db: AsyncSession, *, include_inactive: bool = False
) -> list[CategoryTreeNode]:
    """The catalogue as request types with their service types nested beneath."""
    stmt = select(RequestCategory).order_by(RequestCategory.name)
    if not include_inactive:
        stmt = stmt.where(RequestCategory.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()

    # Built from CategoryOut rather than validated straight off the row:
    # reading `children` from the ORM object would lazy-load under asyncio.
    nodes: dict[int, CategoryTreeNode] = {
        r.id: CategoryTreeNode(**CategoryOut.model_validate(r).model_dump(), children=[])
        for r in rows
    }
    roots: list[CategoryTreeNode] = []
    for r in rows:
        node = nodes[r.id]
        if r.parent_id is None:
            roots.append(node)
        elif r.parent_id in nodes:
            nodes[r.parent_id].children.append(node)
        # Otherwise the service's request type was retired and filtered out.
        # Nothing can be filed under it any more (`resolve_service`), and
        # listed on its own it would pass for a request type.
    return roots


async def resolve_service(
    db: AsyncSession,
    *,
    service_id: int,
    service_type_id: int | None = None,
) -> RequestCategory:
    """Load the chosen service type, verifying it is a usable leaf.

    In the API the leaf is `category_id` and its request type is
    `service_type_id` — names kept from before the catalogue was renamed.
    `service_type_id` is optional because the request type is recoverable
    from the leaf's `parent_id`; when the client does send it, it must agree,
    which catches a stale form that mixes a request type from one branch with
    a service type from another.
    """
    service = (
        await db.execute(select(RequestCategory).where(RequestCategory.id == service_id))
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=400, detail="Tanlangan xizmat turi topilmadi")
    if not service.is_active:
        raise HTTPException(status_code=400, detail="Tanlangan xizmat turi faol emas")

    # A root row is a request type, not something a request can be filed under.
    if service.parent_id is None:
        raise HTTPException(
            status_code=400,
            detail="Murojaat turini emas, aniq xizmat turini tanlang",
        )

    request_type = (
        await db.execute(select(RequestCategory).where(RequestCategory.id == service.parent_id))
    ).scalar_one_or_none()
    if request_type is None:
        raise HTTPException(status_code=400, detail="Murojaat turi topilmadi")
    if not request_type.is_active:
        raise HTTPException(status_code=400, detail="Tanlangan murojaat turi faol emas")

    if service_type_id is not None and service_type_id != request_type.id:
        raise HTTPException(
            status_code=400,
            detail="Tanlangan xizmat turi ushbu murojaat turiga tegishli emas",
        )

    return service
