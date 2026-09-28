from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.config import settings


def check_password_strength(value: str) -> str:
    """Length plus a letter and a digit. Six characters was the old floor."""
    if len(value) < settings.password_min_length:
        raise ValueError(
            f"Parol kamida {settings.password_min_length} ta belgidan iborat bo'lishi kerak"
        )
    if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("Parolda kamida bitta harf va bitta raqam bo'lishi kerak")
    return value


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
    totp_enabled: bool = False
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


class AssigneeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    role: RoleOut
    faculty_id: int | None = None
    department_id: int | None = None


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone: str | None = None
    password: str = Field(max_length=128)
    role_name: str
    faculty_id: int | None = None
    department_id: int | None = None

    _password = field_validator("password")(check_password_strength)


class UserUpdate(BaseModel):
    """Partial update. A field that is sent as `null` is cleared; a field that
    is left out is untouched — that distinction is what lets an administrator
    unbind a registrator from a faculty."""

    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = None
    role_name: str | None = None
    faculty_id: int | None = None
    department_id: int | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, max_length=128)
    #: Turn off a user's second factor, e.g. after they lost their phone.
    reset_2fa: bool | None = None

    @field_validator("password")
    @classmethod
    def _password(cls, value: str | None) -> str | None:
        return None if value is None else check_password_strength(value)
