from pydantic import BaseModel, ConfigDict, Field


class FacultyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    code: str
    contact_email: str | None = None
    is_active: bool


class FacultyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=1, max_length=32)
    contact_email: str | None = None


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
    model_config = ConfigDict(from_attributes=True)
    id: int
    parent_id: int | None = None
    name: str
    sla_hours: int
    priority: str
    is_active: bool
    icon: str | None = None


class CategoryTreeNode(CategoryOut):
    children: list["CategoryTreeNode"] = []


class CategoryCreate(BaseModel):
    parent_id: int | None = None
    name: str = Field(min_length=2, max_length=255)
    sla_hours: int = Field(ge=1, le=24 * 30)
    priority: str = "normal"
    icon: str | None = None


CategoryTreeNode.model_rebuild()
