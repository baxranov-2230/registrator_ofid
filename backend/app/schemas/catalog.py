from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class FacultyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    code: str
    hemis_id: str | None = None
    contact_email: str | None = None
    is_active: bool


class StudentGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    faculty_id: int | None = None
    name: str
    hemis_id: str | None = None
    specialty: str | None = None
    education_year: str | None = None
    is_active: bool


class FacultyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=1, max_length=32)
    contact_email: str | None = None


class FacultyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=32)
    contact_email: str | None = None
    is_active: bool | None = None


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    faculty_id: int
    name: str
    code: str


class DepartmentCreate(BaseModel):
    faculty_id: int
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=1, max_length=32)


class CategoryOut(BaseModel):
    """A catalogue node: a request type (root) or a service type (child).

    `sla_hours`, `priority`, `routing`, `auto_reply_text`,
    `auto_reply_description` and `assignee_id` describe how a request filed
    under a service type is handled; on a request type they are unused. An
    automatic answer's files are listed on their own
    (`GET /admin/categories/{id}/files`).
    """

    model_config = ConfigDict(from_attributes=True)
    id: int
    parent_id: int | None = None
    name: str
    description: str | None = None
    sla_hours: int
    priority: str
    routing: str
    auto_reply_text: str | None = None
    #: "Tasnifi" sent with `auto_reply_text`.
    auto_reply_description: str | None = None
    #: The employee a `general_manager` service's requests go to; `None`
    #: means the flagged general managers.
    assignee_id: int | None = None
    is_active: bool
    icon: str | None = None


class CategoryTreeNode(CategoryOut):
    children: list["CategoryTreeNode"] = []


class AutoReplyFileOut(BaseModel):
    """A file an `auto_reply` service sends with its answer."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int
    file_name: str
    file_size: int
    mime_type: str
    created_at: datetime


PRIORITIES = ("low", "normal", "high", "critical")

Routing = Literal["auto_reply", "faculty_manager", "general_manager"]


class CategoryCreate(BaseModel):
    """Without `parent_id`, a request type: only `name` and `description`
    matter. With it, a service type under that request type."""

    parent_id: int | None = None
    name: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    sla_hours: int = Field(default=24, ge=1, le=24 * 30)
    priority: Literal["low", "normal", "high", "critical"] = "normal"
    routing: Routing = "faculty_manager"
    auto_reply_text: str | None = Field(default=None, max_length=10000)
    auto_reply_description: str | None = Field(default=None, max_length=2000)
    #: Only with `routing="general_manager"`: an active staff member or
    #: registrator who receives every request filed under the service.
    assignee_id: int | None = None
    icon: str | None = None


class CategoryUpdate(BaseModel):
    parent_id: int | None = None
    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    sla_hours: int | None = Field(default=None, ge=1, le=24 * 30)
    priority: Literal["low", "normal", "high", "critical"] | None = None
    routing: Routing | None = None
    auto_reply_text: str | None = Field(default=None, max_length=10000)
    auto_reply_description: str | None = Field(default=None, max_length=2000)
    assignee_id: int | None = None
    icon: str | None = None
    is_active: bool | None = None


class DepartmentUpdate(BaseModel):
    faculty_id: int | None = None
    name: str | None = Field(default=None, min_length=2, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=32)


class StudentGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    faculty_id: int | None = None
    specialty: str | None = None
    education_year: str | None = None
    is_active: bool | None = None


CategoryTreeNode.model_rebuild()
