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

    `sla_hours`, `priority`, `routing` and `auto_reply_text` describe how a
    request filed under a service type is handled; on a request type they are
    unused.
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
    is_active: bool
    icon: str | None = None


class CategoryTreeNode(CategoryOut):
    children: list["CategoryTreeNode"] = []


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
    icon: str | None = None


class CategoryUpdate(BaseModel):
    parent_id: int | None = None
    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    sla_hours: int | None = Field(default=None, ge=1, le=24 * 30)
    priority: Literal["low", "normal", "high", "critical"] | None = None
    routing: Routing | None = None
    auto_reply_text: str | None = Field(default=None, max_length=10000)
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
