from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, JSONVariant, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    STUDENT = "student"
    REGISTRATOR = "registrator"
    STAFF = "staff"
    ADMIN = "admin"
    LEADERSHIP = "leadership"

    ALL = (STUDENT, REGISTRATOR, STAFF, ADMIN, LEADERSHIP)

    #: Roles that may read every request, regardless of ownership.
    SEES_ALL_REQUESTS = (REGISTRATOR, ADMIN, LEADERSHIP)
    #: Roles that may triage: assign, reassign, return to the student.
    CAN_TRIAGE = (REGISTRATOR, ADMIN)
    #: Roles that may move a request through the workflow.
    CAN_TRANSITION = (STAFF, REGISTRATOR, ADMIN)
    #: Roles that may read staff-only notes and internal history.
    SEES_INTERNAL = (STAFF, REGISTRATOR, ADMIN, LEADERSHIP)
    #: Roles that may manage users and catalogs.
    CAN_ADMINISTER = (ADMIN,)
    #: Read-only oversight — reaches every request and every report, mutates nothing.
    READ_ONLY = (LEADERSHIP,)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    permissions: Mapped[dict] = mapped_column(JSONVariant, default=dict, nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="role")
