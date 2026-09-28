from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_client_secret, new_client_credentials, verify_client_secret
from app.models import ApiClient


async def _assert_name_free(db: AsyncSession, name: str, *, exclude_id: int | None = None) -> None:
    stmt = select(ApiClient.id).where(ApiClient.name == name)
    if exclude_id is not None:
        stmt = stmt.where(ApiClient.id != exclude_id)
    if (await db.execute(stmt)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu nomdagi integratsiya allaqachon mavjud",
        )


async def create_client(
    db: AsyncSession,
    *,
    name: str,
    description: str | None,
    scopes: list[str],
    created_by: int,
) -> tuple[ApiClient, str]:
    """Register a client. Returns it with the plaintext secret, which is never stored."""
    await _assert_name_free(db, name)
    client_id, secret = new_client_credentials()
    client = ApiClient(
        name=name,
        description=description,
        client_id=client_id,
        secret_hash=hash_client_secret(secret),
        secret_version=1,
        scopes=scopes,
        is_active=True,
        created_by=created_by,
    )
    db.add(client)
    await db.flush()
    return client, secret


async def update_client(db: AsyncSession, client: ApiClient, changes: dict) -> ApiClient:
    if "name" in changes and changes["name"] != client.name:
        await _assert_name_free(db, changes["name"], exclude_id=client.id)
    for field, value in changes.items():
        setattr(client, field, value)
    await db.flush()
    return client


async def rotate_secret(db: AsyncSession, client: ApiClient) -> str:
    """Issue a new secret. The old one, and every token minted with it, stops working."""
    _, secret = new_client_credentials()
    client.secret_hash = hash_client_secret(secret)
    client.secret_version += 1
    await db.flush()
    return secret


async def get_client(db: AsyncSession, client_pk: int) -> ApiClient:
    client = await db.get(ApiClient, client_pk)
    if client is None:
        raise HTTPException(status_code=404, detail="Integratsiya topilmadi")
    return client


async def authenticate_client(
    db: AsyncSession, client_id: str, client_secret: str
) -> ApiClient | None:
    """The active client these credentials belong to, or None."""
    client = (
        await db.execute(select(ApiClient).where(ApiClient.client_id == client_id))
    ).scalar_one_or_none()
    if client is None or not client.is_active:
        return None
    if not verify_client_secret(client_secret, client.secret_hash):
        return None
    client.last_used_at = datetime.now(UTC)
    await db.flush()
    return client
