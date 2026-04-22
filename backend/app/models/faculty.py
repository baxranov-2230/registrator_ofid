from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class Faculty(Base, TimestampMixin):
    __tablename__ = "faculties"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    hemis_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    dean_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    contact_email: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    departments: Mapped[list["Department"]] = relationship(
        back_populates="faculty", cascade="all, delete-orphan"
    )
    users: Mapped[list["User"]] = relationship(
        back_populates="faculty", foreign_keys="User.faculty_id"
    )
    groups: Mapped[list["StudentGroup"]] = relationship(
        back_populates="faculty", cascade="all, delete-orphan"
    )


class Department(Base, TimestampMixin):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    faculty_id: Mapped[int] = mapped_column(
        ForeignKey("faculties.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    head_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    faculty: Mapped["Faculty"] = relationship(back_populates="departments")
    users: Mapped[list["User"]] = relationship(
        back_populates="department", foreign_keys="User.department_id"
    )


class StudentGroup(Base, TimestampMixin):
    __tablename__ = "student_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    faculty_id: Mapped[int | None] = mapped_column(
        ForeignKey("faculties.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    hemis_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    specialty: Mapped[str | None] = mapped_column(String(255))
    education_year: Mapped[str | None] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    faculty: Mapped["Faculty | None"] = relationship(back_populates="groups")
    users: Mapped[list["User"]] = relationship(
        back_populates="student_group", foreign_keys="User.student_group_id"
    )
