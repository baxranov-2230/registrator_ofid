"""Separate profile tables for the two kinds of people in the system.

`users` is deliberately kept as the identity table: it holds only what
authentication and authorship need (credentials, role, active flag), and every
existing foreign key — request authorship, chat messages, audit entries — keeps
pointing at it. Splitting those keys would have meant a nullable pair of columns
on seven tables with no database-level guarantee that exactly one is set.

What *is* split is the profile. Student attributes (HEMIS id, group, course)
live only in `students`; employee attributes (position, hire date, faculty
assignment) live only in `employees`. Neither table can hold the other's
columns, which is the separation the two directories actually need.
"""

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.faculty import Department, Faculty, StudentGroup
    from app.models.user import User


class Student(Base, TimestampMixin):
    """Academic profile, owned by HEMIS and refreshed on every login."""

    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: One profile per identity. Deleting the identity removes the profile.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )

    #: HEMIS student number — the identifier staff look people up by.
    external_student_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True
    )
    faculty_id: Mapped[int | None] = mapped_column(ForeignKey("faculties.id"), index=True)
    student_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("student_groups.id", ondelete="SET NULL"), index=True
    )

    birth_date: Mapped[str | None] = mapped_column(String(32))
    gender: Mapped[str | None] = mapped_column(String(16))
    address: Mapped[str | None] = mapped_column(String(500))
    image_path: Mapped[str | None] = mapped_column(String(500))
    specialty: Mapped[str | None] = mapped_column(String(255))
    group_name: Mapped[str | None] = mapped_column(String(128))
    level: Mapped[int | None] = mapped_column(Integer)
    semester: Mapped[int | None] = mapped_column(Integer)
    student_status: Mapped[str | None] = mapped_column(String(64))
    education_form: Mapped[str | None] = mapped_column(String(64))
    education_type: Mapped[str | None] = mapped_column(String(64))
    education_lang: Mapped[str | None] = mapped_column(String(64))
    payment_form: Mapped[str | None] = mapped_column(String(64))

    user: Mapped["User"] = relationship(back_populates="student_profile")
    faculty: Mapped["Faculty | None"] = relationship(foreign_keys=[faculty_id])
    student_group: Mapped["StudentGroup | None"] = relationship(
        foreign_keys=[student_group_id]
    )


class Employee(Base, TimestampMixin):
    """Staff profile: who works where, and which faculty they serve."""

    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )

    #: The faculty binding that routes incoming requests to a registrator.
    faculty_id: Mapped[int | None] = mapped_column(ForeignKey("faculties.id"), index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))

    employee_no: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    position: Mapped[str | None] = mapped_column(String(255))
    hired_at: Mapped[date | None] = mapped_column(Date)
    office: Mapped[str | None] = mapped_column(String(128))
    image_path: Mapped[str | None] = mapped_column(String(500))
    birth_date: Mapped[str | None] = mapped_column(String(32))
    gender: Mapped[str | None] = mapped_column(String(16))
    address: Mapped[str | None] = mapped_column(String(500))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="employee_profile")
    faculty: Mapped["Faculty | None"] = relationship(foreign_keys=[faculty_id])
    department: Mapped["Department | None"] = relationship(foreign_keys=[department_id])
