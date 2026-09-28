from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field

from app.schemas.request import RequestCreate


class IntegrationRequestCreate(RequestCreate):
    """A request filed by an external system (e.g. the LMS) for a student.

    The system is trusted with the student fields: the student is created or
    updated from them, and `faculty` decides which registrator receives the
    request.
    """

    # Trim before the length checks, so "  " is rejected rather than stored.
    model_config = ConfigDict(str_strip_whitespace=True)

    #: HEMIS student number. Named apart from the response's `student_id`,
    #: which is ROYD's internal user id.
    student_hemis_id: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=255)
    #: Link to the student's photo, shown as-is in the staff UI.
    image: AnyHttpUrl | None = Field(default=None, max_length=500)
    #: Faculty name. Matched to an existing faculty, or created.
    faculty: str = Field(min_length=1, max_length=255)
    #: Group name, within that faculty. Matched, or created.
    group: str = Field(min_length=1, max_length=128)

    def student_profile(self) -> dict:
        """The normalized profile shape `sync_student_from_profile` expects."""
        return {
            "student_id_number": self.student_hemis_id,
            "full_name": self.full_name,
            "image_path": str(self.image) if self.image else None,
            "faculty": self.faculty,
            "group": self.group,
        }


class IntegrationMessage(BaseModel):
    """A message from the student. There is no `is_internal`: that is staff-only."""

    content: str = Field(min_length=1, max_length=5000)
