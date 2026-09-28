"""Transactional outbox for side effects that leave the system.

Emails and partner webhooks used to be sent from an in-process task created
after the request committed. A restart or a crash between commit and send lost
them silently. They are now written as rows in the same transaction as the
change that caused them, and a periodic job delivers them with retries — so a
notification exists if and only if its cause was committed.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONVariant


class OutboxKind:
    EMAIL = "email"
    WEBHOOK = "webhook"


class OutboxStatus:
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class OutboxMessage(Base):
    __tablename__ = "outbox"
    __table_args__ = (Index("ix_outbox_status_next_attempt", "status", "next_attempt_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONVariant, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default=OutboxStatus.PENDING, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
