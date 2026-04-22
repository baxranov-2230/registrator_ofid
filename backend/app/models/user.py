from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.faculty import Department, Faculty, StudentGroup
    from app.models.role import Role


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False)
    faculty_id: Mapped[int | None] = mapped_column(ForeignKey("faculties.id"))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    student_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("student_groups.id", ondelete="SET NULL"), index=True
    )
    external_student_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # HEMIS student profile fields
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

    role: Mapped["Role"] = relationship(back_populates="users", lazy="joined")
    faculty: Mapped["Faculty | None"] = relationship(
        back_populates="users", foreign_keys=[faculty_id]
    )
    department: Mapped["Department | None"] = relationship(
        back_populates="users", foreign_keys=[department_id]
    )
    student_group: Mapped["StudentGroup | None"] = relationship(
        back_populates="users", foreign_keys=[student_group_id]
    )
