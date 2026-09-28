"""Admin management of API clients: register, edit, revoke, rotate the secret.

Nothing is hard-deleted. Requests keep a reference to the client that filed
them, so a retired integration is deactivated instead (`is_active=False`).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user, require_roles
from app.models import ApiClient, Role, User
from app.schemas.api_client import (
    ApiClientCreate,
    ApiClientCredentials,
    ApiClientOut,
    ApiClientUpdate,
)
from app.services.api_client_service import create_client, get_client, rotate_secret, update_client
from app.services.audit_service import log_action

router = APIRouter(
    prefix="/admin/api-clients",
    tags=["admin-api-clients"],
    dependencies=[Depends(require_roles(*Role.CAN_ADMINISTER))],
)


def _snapshot(client: ApiClient) -> dict:
    return {
        "name": client.name,
        "description": client.description,
        "scopes": list(client.scopes),
        "is_active": client.is_active,
    }


@router.get("", response_model=list[ApiClientOut])
async def list_clients(db: AsyncSession = Depends(get_db)) -> list[ApiClientOut]:
    rows = (await db.execute(select(ApiClient).order_by(ApiClient.name))).scalars().all()
    return [ApiClientOut.model_validate(r) for r in rows]


@router.post("", response_model=ApiClientCredentials, status_code=201)
async def create(
    data: ApiClientCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> ApiClientCredentials:
    """Register a client. The secret is in this response and nowhere else."""
    client, secret = await create_client(
        db,
        name=data.name.strip(),
        description=data.description,
        scopes=data.scopes,
        created_by=actor.id,
    )
    await log_action(
        db,
        user_id=actor.id,
        action="api_client.create",
        entity_type="api_client",
        entity_id=client.id,
        new_value={"client_id": client.client_id, **_snapshot(client)},
    )
    await db.commit()
    return ApiClientCredentials(
        **ApiClientOut.model_validate(client).model_dump(), client_secret=secret
    )


@router.patch("/{client_pk}", response_model=ApiClientOut)
async def update(
    client_pk: int,
    data: ApiClientUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> ApiClientOut:
    client = await get_client(db, client_pk)
    old = _snapshot(client)
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()
    # `name`, `scopes` and `is_active` cannot be cleared, only changed.
    changes = {k: v for k, v in changes.items() if v is not None or k == "description"}
    await update_client(db, client, changes)
    await log_action(
        db,
        user_id=actor.id,
        action="api_client.update",
        entity_type="api_client",
        entity_id=client.id,
        old_value=old,
        new_value=_snapshot(client),
    )
    await db.commit()
    await db.refresh(client)
    return ApiClientOut.model_validate(client)


@router.post("/{client_pk}/rotate-secret", response_model=ApiClientCredentials)
async def rotate(
    client_pk: int,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> ApiClientCredentials:
    """Issue a new secret. The old secret and every token minted with it stop working."""
    client = await get_client(db, client_pk)
    secret = await rotate_secret(db, client)
    await log_action(
        db,
        user_id=actor.id,
        action="api_client.rotate_secret",
        entity_type="api_client",
        entity_id=client.id,
        new_value={"secret_version": client.secret_version},
    )
    await db.commit()
    await db.refresh(client)
    return ApiClientCredentials(
        **ApiClientOut.model_validate(client).model_dump(), client_secret=secret
    )
