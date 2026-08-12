from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

#: JSONB on Postgres (the production database), plain JSON elsewhere. Lets the
#: test suite build the same schema on SQLite instead of needing a live server.
JSONVariant = JSONB().with_variant(JSON(), "sqlite")


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
