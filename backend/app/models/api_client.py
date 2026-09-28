from datetime import datetime
from typing import ClassVar

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONVariant, TimestampMixin


class ApiClient(Base, TimestampMixin):
    """An external system that calls the API as itself (OAuth2 client_credentials).

    The secret is never stored, only its SHA-256 digest. It is shown to the
    admin once, at creation or rotation, and cannot be recovered afterwards.
    """

    __tablename__ = "api_clients"

    REQUESTS_READ = "requests:read"
    REQUESTS_WRITE = "requests:write"
    CATALOGS_READ = "catalogs:read"

    #: Every scope a client can be granted, with the label shown in Swagger.
    SCOPES: ClassVar[dict[str, str]] = {
        REQUESTS_READ: "O'zi yaratgan murojaatlarni o'qish",
        REQUESTS_WRITE: "Talaba nomidan murojaat yaratish, xabar va fayl qo'shish",
        CATALOGS_READ: "Xizmatlar katalogini o'qish",
    }

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    #: Public identifier the client presents with its secret.
    client_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    secret_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    #: Carried by every token as `ver`. Rotating the secret bumps it, which
    #: kills the tokens minted with the old secret instead of letting them
    #: live out their TTL.
    secret_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    scopes: Mapped[list[str]] = mapped_column(JSONVariant, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    #: Last successful token exchange — not every API call, which would turn
    #: each read into a write.
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
