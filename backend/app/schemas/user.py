from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str | None = None
    phone: str | None = None
    role: RoleOut
    faculty_id: int | None = None
    department_id: int | None = None
    external_student_id: str | None = None
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime
    # Student profile fields (populated from HEMIS)
    birth_date: str | None = None
    gender: str | None = None
    address: str | None = None
    image_path: str | None = None
    specialty: str | None = None
    group_name: str | None = None
    level: int | None = None
    semester: int | None = None
    student_status: str | None = None
    education_form: str | None = None
    education_type: str | None = None
    education_lang: str | None = None
    payment_form: str | None = None


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone: str | None = None
    password: str = Field(min_length=6, max_length=128)
    role_name: str
    faculty_id: int | None = None
    department_id: int | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = None
    role_name: str | None = None
    faculty_id: int | None = None
    department_id: int | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
