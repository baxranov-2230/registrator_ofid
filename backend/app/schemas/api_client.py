from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ApiClient


def _check_scopes(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    unknown = [s for s in value if s not in ApiClient.SCOPES]
    if unknown:
        raise ValueError(f"Noma'lum scope: {', '.join(unknown)}")
    # Keep the canonical order, drop duplicates.
    return [s for s in ApiClient.SCOPES if s in value]


class ApiClientCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    scopes: list[str] = Field(min_length=1)

    _scopes = field_validator("scopes")(_check_scopes)


class ApiClientUpdate(BaseModel):
    """Partial update; a field left out is left alone."""

    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    scopes: list[str] | None = Field(default=None, min_length=1)
    is_active: bool | None = None

    _scopes = field_validator("scopes")(_check_scopes)


class ApiClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    client_id: str
    scopes: list[str]
    is_active: bool
    last_used_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ApiClientCredentials(ApiClientOut):
    """Returned only on create and on secret rotation — the secret is not stored."""

    client_secret: str


class ClientTokenResponse(BaseModel):
    """RFC 6749 §5.1 access token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    scope: str
