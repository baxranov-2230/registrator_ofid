from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, JSONVariant
from app.models.user import User


class NotificationType:
    REQUEST_CREATED = "request_created"
    REQUEST_ASSIGNED = "request_assigned"
    REQUEST_STATUS = "request_status"
    REQUEST_MESSAGE = "request_message"
    SYSTEM = "system"


class NotificationChannel:
    IN_APP = "in_app"
    EMAIL = "email"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(
        String(32), default=NotificationChannel.IN_APP, nullable=False
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSONVariant, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship()
