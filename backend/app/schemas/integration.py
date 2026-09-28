from pydantic import BaseModel, EmailStr, Field

from app.schemas.request import RequestCreate


class IntegrationRef(BaseModel):
    """A faculty, department or group as the client's system knows it.

    Matched by `hemis_id` first, then by `name`; created when neither matches.
    """

    name: str = Field(min_length=1, max_length=255)
    hemis_id: str | None = Field(default=None, max_length=64)
    code: str | None = Field(default=None, max_length=32)


class IntegrationStudent(BaseModel):
    """The student a request is filed for, as supplied by the client.

    The client is trusted with this data: the student is created or updated
    from it, and the faculty decides which registrator receives the request.
    """

    hemis_id: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=255)
    faculty: IntegrationRef
    department: IntegrationRef | None = None
    group: IntegrationRef | None = None
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    specialty: str | None = Field(default=None, max_length=255)
    #: Course number.
    level: int | None = Field(default=None, ge=1, le=10)
    education_form: str | None = Field(default=None, max_length=64)

    def to_profile(self) -> dict:
        """The normalized profile shape `sync_student_from_profile` expects."""
        return {
            "student_id_number": self.hemis_id,
            "full_name": self.full_name,
            "email": self.email,
            "phone": self.phone,
            "faculty": self.faculty.model_dump(),
            "department": self.department.model_dump() if self.department else None,
            "group": self.group.model_dump() if self.group else None,
            "specialty": self.specialty,
            "level": self.level,
            "education_form": self.education_form,
        }


class IntegrationRequestCreate(RequestCreate):
    student: IntegrationStudent


class IntegrationMessage(BaseModel):
    """A message from the student. There is no `is_internal`: that is staff-only."""

    content: str = Field(min_length=1, max_length=5000)
