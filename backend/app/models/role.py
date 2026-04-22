from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    STUDENT = "student"
    REGISTRATOR = "registrator"
    STAFF = "staff"
    ADMIN = "admin"
    LEADERSHIP = "leadership"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    permissions: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="role")
