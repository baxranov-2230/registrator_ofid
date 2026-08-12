from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.request import RequestStatus
from app.schemas.catalog import CategoryOut


class Page[T](BaseModel):
    """Envelope for paginated list endpoints (C-06)."""

    items: list[T]
    total: int
    limit: int
    offset: int


class RequestCreate(BaseModel):
    """What a student submits.

    There is deliberately no `assigned_to`: the handler is derived from the
    student's faculty server-side, so a client cannot aim a request at a
    registrator of its choosing.
    """

    #: The chosen leaf service. Its service type is derived from `parent_id`.
    category_id: int
    #: The type the student picked. Optional, but cross-checked when present so
    #: a mismatched type/service pair is rejected rather than quietly accepted.
    service_type_id: int | None = None
    title: str = Field(min_length=3, max_length=500)
    description: str = Field(min_length=3)


class RequestAssign(BaseModel):
    assignee_id: int
    faculty_id: int | None = None
    department_id: int | None = None
    comment: str | None = None


class RequestTransition(BaseModel):
    status: str
    comment: str | None = None


class MessageCreate(BaseModel):
    content: str = Field(min_length=1)
    is_internal: bool = False


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    request_id: int
    sender_id: int
    content: str
    is_internal: bool
    created_at: datetime
    #: Author's display name and role, so the thread reads as a conversation
    #: instead of a column of numeric ids. Filled in by `with_actors`.
    sender_name: str | None = None
    sender_role: str | None = None


class RequestFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    request_id: int
    uploaded_by: int
    file_name: str
    file_size: int
    mime_type: str
    created_at: datetime


class RequestHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    request_id: int
    changed_by: int | None = None
    old_status: str | None = None
    new_status: str
    comment: str | None = None
    created_at: datetime
    #: Who made the change. Filled in by `with_actors`.
    changed_by_name: str | None = None
    changed_by_role: str | None = None


class UserMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str | None = None


class RequestSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tracking_no: str
    title: str
    status: str
    priority: str
    category_id: int
    student_id: int
    assigned_to: int | None = None
    faculty_id: int | None = None
    department_id: int | None = None
    sla_deadline: datetime
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_overdue(self) -> bool:
        """Open past its SLA deadline. Drives the overdue counters and badges."""
        if self.status in RequestStatus.CLOSED:
            return False
        deadline = self.sla_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=UTC)
        return deadline < datetime.now(UTC)


class RequestDetail(RequestSummary):
    description: str
    category: CategoryOut
    #: The parent service type of `category`, so the request can be shown as
    #: "Xizmat turi → Xizmat" without the client re-walking the tree.
    service_type: CategoryOut | None = None
    student: UserMini
    assignee: UserMini | None = None
    history: list[RequestHistoryOut] = []
    files: list[RequestFileOut] = []
    messages: list[MessageOut] = []

    @classmethod
    def for_viewer(cls, req, *, include_internal: bool) -> "RequestDetail":
        """Build a detail payload, stripping staff-only notes for students.

        Students may read their own request, so filtering internal messages is
        the only thing standing between them and staff-to-staff discussion
        (B-01). Going through this constructor keeps that decision in one place
        instead of relying on every call site to remember it.
        """
        detail = cls.model_validate(req)
        if not include_internal:
            detail.messages = [m for m in detail.messages if not m.is_internal]
        detail._fill_actor_names(req)
        parent = getattr(req.category, "parent", None) if req.category else None
        if parent is not None:
            detail.service_type = CategoryOut.model_validate(parent)
        return detail

    def _fill_actor_names(self, req) -> None:
        """Resolve message senders and history actors to names.

        The relationships are already loaded on the detail path, so this is a
        dict lookup rather than extra queries.
        """
        people: dict[int, object] = {}
        for person in (req.student, req.assignee):
            if person is not None:
                people[person.id] = person
        for msg in req.messages:
            if msg.sender is not None:
                people[msg.sender_id] = msg.sender
        for entry in req.history:
            if entry.user is not None:
                people[entry.changed_by] = entry.user

        def describe(user_id: int | None) -> tuple[str | None, str | None]:
            person = people.get(user_id) if user_id is not None else None
            if person is None:
                return None, None
            return person.full_name, person.role_name

        for msg_out in self.messages:
            msg_out.sender_name, msg_out.sender_role = describe(msg_out.sender_id)
        for hist_out in self.history:
            hist_out.changed_by_name, hist_out.changed_by_role = describe(hist_out.changed_by)
