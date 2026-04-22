from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class RequestCategory(Base, TimestampMixin):
    __tablename__ = "request_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("request_categories.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sla_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    priority: Mapped[str] = mapped_column(String(16), default="normal", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    icon: Mapped[str | None] = mapped_column(String(64))

    parent: Mapped["RequestCategory | None"] = relationship(
        remote_side="RequestCategory.id", back_populates="children"
    )
    children: Mapped[list["RequestCategory"]] = relationship(back_populates="parent")
