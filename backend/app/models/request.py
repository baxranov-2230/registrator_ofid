from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.category import RequestCategory
from app.models.faculty import Department, Faculty
from app.models.user import User


class RequestStatus:
    NEW = "new"
    ACCEPTED = "accepted"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REJECTED = "rejected"
    RETURNED = "returned"

    ALL = (NEW, ACCEPTED, IN_PROGRESS, COMPLETED, REJECTED, RETURNED)
    OPEN = (NEW, ACCEPTED, IN_PROGRESS, RETURNED)
    CLOSED = (COMPLETED, REJECTED)


class Request(Base, TimestampMixin):
    __tablename__ = "requests"
    __table_args__ = (
        Index("ix_requests_status_created_at", "status", "created_at"),
        Index("ix_requests_sla_deadline", "sla_deadline"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tracking_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("request_categories.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=RequestStatus.NEW, nullable=False)
    priority: Mapped[str] = mapped_column(String(16), default="normal", nullable=False)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    faculty_id: Mapped[int | None] = mapped_column(ForeignKey("faculties.id"))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    sla_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    student: Mapped["User"] = relationship(foreign_keys=[student_id])
    assignee: Mapped["User | None"] = relationship(foreign_keys=[assigned_to])
    category: Mapped["RequestCategory"] = relationship()
    faculty: Mapped["Faculty | None"] = relationship(foreign_keys=[faculty_id])
    department: Mapped["Department | None"] = relationship(foreign_keys=[department_id])

    history: Mapped[list["RequestHistory"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="RequestHistory.created_at",
    )
    files: Mapped[list["RequestFile"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="RequestFile.created_at",
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class RequestHistory(Base):
    __tablename__ = "request_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    old_status: Mapped[str | None] = mapped_column(String(32))
    new_status: Mapped[str] = mapped_column(String(32), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.utcnow(), nullable=False
    )

    request: Mapped["Request"] = relationship(back_populates="history")
    user: Mapped["User | None"] = relationship()


class RequestFile(Base):
    __tablename__ = "request_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.utcnow(), nullable=False
    )

    request: Mapped["Request"] = relationship(back_populates="files")
    uploader: Mapped["User"] = relationship()


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.utcnow(), nullable=False
    )

    request: Mapped["Request"] = relationship(back_populates="messages")
    sender: Mapped["User"] = relationship()
