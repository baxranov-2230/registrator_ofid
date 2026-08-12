from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.profile import Employee, Student
    from app.models.role import Role


class User(Base, TimestampMixin):
    """Identity only: credentials, role, and the active flag.

    Profile data lives in `students` / `employees` (see models/profile.py).
    This table stays because authorship columns across the schema — message
    senders, history actors, audit entries — need a single target that can be
    either kind of person.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    role: Mapped["Role"] = relationship(back_populates="users", lazy="joined")
    #: Exactly one of these is set, decided by `role`.
    student_profile: Mapped["Student | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False, lazy="selectin"
    )
    employee_profile: Mapped["Employee | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False, lazy="selectin"
    )

    @property
    def role_name(self) -> str | None:
        """Role name, or None when unset — avoids `user.role.name` blowing up (B-12)."""
        return self.role.name if self.role else None

    def has_role(self, *names: str) -> bool:
        return self.role_name in names

    @property
    def profile(self) -> "Student | Employee | None":
        """Whichever profile this identity owns."""
        return self.student_profile or self.employee_profile

    # ── Profile passthroughs ────────────────────────────────────────────────
    # The columns below moved to the profile tables. These read-through
    # properties keep call sites that only need the value working unchanged;
    # writes go to the owning profile explicitly.

    @property
    def faculty_id(self) -> int | None:
        """Faculty of whichever profile exists — the routing key for requests."""
        profile = self.profile
        return profile.faculty_id if profile else None

    @property
    def department_id(self) -> int | None:
        return self.employee_profile.department_id if self.employee_profile else None

    @property
    def external_student_id(self) -> str | None:
        return self.student_profile.external_student_id if self.student_profile else None

    @property
    def student_group_id(self) -> int | None:
        return self.student_profile.student_group_id if self.student_profile else None

    @property
    def image_path(self) -> str | None:
        profile = self.profile
        return getattr(profile, "image_path", None) if profile else None

    def _from_profile(self, field: str):
        """Read a field from whichever profile carries it, else None."""
        profile = self.profile
        return getattr(profile, field, None) if profile else None

    # Fields that exist on both profiles.
    @property
    def birth_date(self) -> str | None:
        return self._from_profile("birth_date")

    @property
    def gender(self) -> str | None:
        return self._from_profile("gender")

    @property
    def address(self) -> str | None:
        return self._from_profile("address")

    # Student-only fields; None for staff by construction.
    @property
    def specialty(self) -> str | None:
        return self._from_profile("specialty")

    @property
    def group_name(self) -> str | None:
        return self._from_profile("group_name")

    @property
    def level(self) -> int | None:
        return self._from_profile("level")

    @property
    def semester(self) -> int | None:
        return self._from_profile("semester")

    @property
    def student_status(self) -> str | None:
        return self._from_profile("student_status")

    @property
    def education_form(self) -> str | None:
        return self._from_profile("education_form")

    @property
    def education_type(self) -> str | None:
        return self._from_profile("education_type")

    @property
    def education_lang(self) -> str | None:
        return self._from_profile("education_lang")

    @property
    def payment_form(self) -> str | None:
        return self._from_profile("payment_form")
