from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.catalog import CategoryOut


class RequestCreate(BaseModel):
    category_id: int
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


class RequestDetail(RequestSummary):
    description: str
    closed_at: datetime | None = None
    category: CategoryOut
    student: UserMini
    assignee: UserMini | None = None
    history: list[RequestHistoryOut] = []
    files: list[RequestFileOut] = []
    messages: list[MessageOut] = []
