from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.faculty import Department, Faculty
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
    external_student_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    role: Mapped["Role"] = relationship(back_populates="users", lazy="joined")
    faculty: Mapped["Faculty | None"] = relationship(
        back_populates="users", foreign_keys=[faculty_id]
    )
    department: Mapped["Department | None"] = relationship(
        back_populates="users", foreign_keys=[department_id]
    )
