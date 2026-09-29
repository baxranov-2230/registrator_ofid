from datetime import UTC, datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ServiceRouting:
    """Where a request filed under a service goes, chosen per service.

    Plain strings validated in Python, like `RequestStatus`, so adding a route
    is a code change rather than a migration.
    """

    #: The system answers at once with the service's `auto_reply_text` (and
    #: its description and files, when set); no manager ever receives the
    #: request.
    AUTO_REPLY = "auto_reply"
    #: The manager bound to the student's faculty (and preferably department).
    FACULTY_MANAGER = "faculty_manager"
    #: The employee chosen on the service itself (`assignee_id`) or, when
    #: none is, a manager flagged for general issues — whatever the student's
    #: faculty.
    GENERAL_MANAGER = "general_manager"

    ALL = (AUTO_REPLY, FACULTY_MANAGER, GENERAL_MANAGER)


class RequestCategory(Base, TimestampMixin):
    """One node of the two-level catalogue.

    A root row (`parent_id is None`) is a request type ("Murojaat turi"): a
    name and a description that group related services. Its child rows are
    service types ("Xizmat turi"), the leaves a request is filed under; they
    carry the SLA, the priority and the routing applied to that request. Roots
    keep the SLA and priority columns only because the table is shared.
    """

    __tablename__ = "request_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("request_categories.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    #: "Tasnifi" — what the request type covers. Used on root rows.
    description: Mapped[str | None] = mapped_column(Text)
    sla_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    priority: Mapped[str] = mapped_column(String(16), default="normal", nullable=False)
    #: A `ServiceRouting` value. Used on service rows.
    routing: Mapped[str] = mapped_column(
        String(32),
        default=ServiceRouting.FACULTY_MANAGER,
        server_default=ServiceRouting.FACULTY_MANAGER,
        nullable=False,
    )
    #: The answer sent when `routing` is `auto_reply`.
    auto_reply_text: Mapped[str | None] = mapped_column(Text)
    #: "Tasnifi" of that answer, sent with it. Optional.
    auto_reply_description: Mapped[str | None] = mapped_column(Text)
    #: The employee who receives this service's requests when `routing` is
    #: `general_manager`. Unset, they go to the flagged general managers.
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    icon: Mapped[str | None] = mapped_column(String(64))

    parent: Mapped["RequestCategory | None"] = relationship(
        remote_side="RequestCategory.id", back_populates="children"
    )
    children: Mapped[list["RequestCategory"]] = relationship(back_populates="parent")
    auto_reply_files: Mapped[list["AutoReplyFile"]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="[AutoReplyFile.created_at, AutoReplyFile.id]",
    )


class AutoReplyFile(Base):
    """A file an `auto_reply` service sends with its answer.

    Uploaded once by an administrator. Every request the service answers gets
    a `RequestFile` flagged `is_answer` that points at the same stored bytes,
    so the bytes stay on disk after the file is taken off the service: earlier
    answers still reference them.
    """

    __tablename__ = "auto_reply_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("request_categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    category: Mapped["RequestCategory"] = relationship(back_populates="auto_reply_files")
