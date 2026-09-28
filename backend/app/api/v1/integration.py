"""Server-to-server API for external systems (OAuth2 client_credentials).

A client trades its id and secret for a bearer token at `/oauth/token`, then
files and follows requests on students' behalf under `/integration`. It sees
only the requests it filed itself. Contract: docs/INTEGRATION.md.
"""

import base64
import binascii
from urllib.parse import unquote

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    Security,
    UploadFile,
)
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security.utils import get_authorization_scheme_param
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_redis_dep
from app.api.v1.requests import (
    attach_file,
    file_request,
    post_message,
    resubmit_returned,
    stored_file_response,
)
from app.core.config import settings
from app.core.db import get_db
from app.core.security import create_client_token, get_current_client
from app.models import ApiClient, Student, User
from app.models import Request as RequestModel
from app.models.request import RequestStatus
from app.schemas.api_client import ClientTokenResponse
from app.schemas.catalog import CategoryTreeNode
from app.schemas.integration import IntegrationMessage, IntegrationRequestCreate
from app.schemas.request import (
    MessageOut,
    Page,
    RequestDetail,
    RequestFileOut,
    RequestResubmit,
    RequestSummary,
)
from app.services.api_client_service import authenticate_client
from app.services.auth_service import sync_student_from_profile
from app.services.catalog_service import category_tree
from app.services.request_service import assert_open, find_by_client_ref, reload_detail

oauth_router = APIRouter(prefix="/oauth", tags=["integration"])
router = APIRouter(prefix="/integration", tags=["integration"])

_READ = [ApiClient.REQUESTS_READ]
_WRITE = [ApiClient.REQUESTS_WRITE]

_TOKEN_ERRORS = {
    400: {"description": "`invalid_request`, `unsupported_grant_type` yoki `invalid_scope`"},
    401: {"description": "`invalid_client`: client_id yoki client_secret noto'g'ri"},
}


# ── Token endpoint ──────────────────────────────────────────────────────────


def _oauth_error(status_code: int, error: str, description: str, *, basic: bool = False):
    """Error body in the RFC 6749 §5.2 shape that OAuth client libraries parse."""
    headers = {"Cache-Control": "no-store", "Pragma": "no-cache"}
    if basic:
        headers["WWW-Authenticate"] = 'Basic realm="royd"'
    return JSONResponse(
        status_code=status_code,
        content={"error": error, "error_description": description},
        headers=headers,
    )


def _basic_credentials(authorization: str | None) -> tuple[str, str] | None:
    """Client id and secret from an HTTP Basic header (RFC 6749 §2.3.1)."""
    scheme, param = get_authorization_scheme_param(authorization)
    if scheme.lower() != "basic" or not param:
        return None
    try:
        decoded = base64.b64decode(param, validate=True).decode()
    except (binascii.Error, UnicodeDecodeError):
        return None
    client_id, sep, secret = decoded.partition(":")
    if not sep:
        return None
    # The spec form-encodes both parts before base64.
    return unquote(client_id), unquote(secret)


@oauth_router.post("/token", response_model=ClientTokenResponse, responses=_TOKEN_ERRORS)
async def issue_token(
    request: Request,
    response: Response,
    grant_type: str | None = Form(default=None, examples=["client_credentials"]),
    scope: str | None = Form(default=None, description="Bo'sh joy bilan ajratilgan scope'lar"),
    client_id: str | None = Form(default=None),
    client_secret: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Exchange client credentials for an access token.

    Credentials go either in an HTTP Basic header or in the form body. Leave
    `scope` out to receive every scope the client has been granted.
    """
    basic = _basic_credentials(request.headers.get("authorization"))
    if basic:
        client_id, client_secret = basic

    if not grant_type:
        return _oauth_error(400, "invalid_request", "grant_type majburiy")
    if grant_type != "client_credentials":
        return _oauth_error(
            400, "unsupported_grant_type", "Faqat client_credentials qo'llab-quvvatlanadi"
        )
    if not client_id or not client_secret:
        return _oauth_error(401, "invalid_client", "client_id va client_secret majburiy")

    client = await authenticate_client(db, client_id, client_secret)
    if client is None:
        return _oauth_error(
            401, "invalid_client", "client_id yoki client_secret noto'g'ri", basic=bool(basic)
        )

    requested = set(scope.split()) if scope else set(client.scopes)
    if not requested <= set(client.scopes):
        extra = ", ".join(sorted(requested - set(client.scopes)))
        return _oauth_error(400, "invalid_scope", f"Bu client'ga berilmagan scope: {extra}")
    granted = [s for s in ApiClient.SCOPES if s in requested]

    token = create_client_token(client, granted)
    # Persists last_used_at.
    await db.commit()

    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return ClientTokenResponse(
        access_token=token,
        expires_in=settings.client_token_ttl_minutes * 60,
        scope=" ".join(granted),
    )


# ── Integration API ─────────────────────────────────────────────────────────


async def _owned_request(db: AsyncSession, request_id: int, client: ApiClient) -> RequestModel:
    """A request this client filed. Anything else is a 404, not a 403, so a
    client cannot probe which request ids exist."""
    req = (
        await db.execute(
            select(RequestModel).where(
                RequestModel.id == request_id, RequestModel.api_client_id == client.id
            )
        )
    ).scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="Murojaat topilmadi")
    return req


async def _student_of(db: AsyncSession, req: RequestModel) -> User:
    return await db.get(User, req.student_id)


async def _client_view(db: AsyncSession, request_id: int) -> RequestDetail:
    # The client speaks for the student, so it gets the student's view:
    # staff-only notes are stripped.
    return RequestDetail.for_viewer(await reload_detail(db, request_id), include_internal=False)


@router.get("/categories", response_model=list[CategoryTreeNode])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: ApiClient = Security(get_current_client, scopes=[ApiClient.CATALOGS_READ]),
) -> list[CategoryTreeNode]:
    """Active service types with their services nested beneath."""
    return await category_tree(db)


@router.post("/requests", response_model=RequestDetail, status_code=201)
async def create_request(
    data: IntegrationRequestCreate,
    response: Response,
    idempotency_key: str | None = Header(
        default=None,
        alias="Idempotency-Key",
        min_length=1,
        max_length=64,
        description=(
            "Client-chosen key for this submission. Repeating a POST with the same key "
            "returns the request created the first time (200) instead of a duplicate."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
    client: ApiClient = Security(get_current_client, scopes=_WRITE),
) -> RequestDetail:
    """File a request for a student described in the body.

    The student is created or updated from the supplied data, and routed to
    the registrator bound to the given faculty.
    """
    student = await sync_student_from_profile(db, data.student.to_profile(), mark_login=False)
    if not student.is_active:
        raise HTTPException(status_code=403, detail="Talaba akkaunti faol emas")

    if idempotency_key:
        existing = await find_by_client_ref(db, student.id, idempotency_key)
        if existing is not None:
            if existing.api_client_id != client.id:
                raise HTTPException(
                    status_code=409, detail="Bu Idempotency-Key boshqa murojaatda ishlatilgan"
                )
            response.status_code = 200
            return await _client_view(db, existing.id)

    req = await file_request(
        db, redis, student=student, data=data, client_ref=idempotency_key, api_client=client
    )
    await db.commit()
    return await _client_view(db, req.id)


@router.get("/requests", response_model=Page[RequestSummary])
async def list_requests(
    status: str | None = Query(default=None),
    student_hemis_id: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    client: ApiClient = Security(get_current_client, scopes=_READ),
) -> Page[RequestSummary]:
    if status is not None and status not in RequestStatus.ALL:
        raise HTTPException(status_code=422, detail=f"Noma'lum holat: {status}")

    filters = [RequestModel.api_client_id == client.id]
    if status:
        filters.append(RequestModel.status == status)
    if student_hemis_id:
        filters.append(
            RequestModel.student_id.in_(
                select(Student.user_id).where(Student.external_student_id == student_hemis_id)
            )
        )

    total = (
        await db.execute(select(func.count()).select_from(RequestModel).where(*filters))
    ).scalar_one()
    rows = (
        (
            await db.execute(
                select(RequestModel)
                .where(*filters)
                .order_by(RequestModel.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return Page[RequestSummary](
        items=[RequestSummary.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/requests/{request_id}", response_model=RequestDetail)
async def get_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    client: ApiClient = Security(get_current_client, scopes=_READ),
) -> RequestDetail:
    req = await _owned_request(db, request_id, client)
    return await _client_view(db, req.id)


@router.post("/requests/{request_id}/messages", response_model=MessageOut, status_code=201)
async def add_message(
    request_id: int,
    data: IntegrationMessage,
    db: AsyncSession = Depends(get_db),
    client: ApiClient = Security(get_current_client, scopes=_WRITE),
) -> MessageOut:
    """Post a message from the student."""
    req = await _owned_request(db, request_id, client)
    assert_open(req)
    out = await post_message(
        db, req, await _student_of(db, req), content=data.content, is_internal=False
    )
    await db.commit()
    return out


@router.post("/requests/{request_id}/files", response_model=RequestFileOut, status_code=201)
async def upload_file(
    request_id: int,
    upload: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    client: ApiClient = Security(get_current_client, scopes=_WRITE),
) -> RequestFileOut:
    """Attach a file from the student."""
    req = await _owned_request(db, request_id, client)
    assert_open(req)
    out = await attach_file(db, req, await _student_of(db, req), upload)
    await db.commit()
    return out


@router.get("/requests/{request_id}/files/{file_id}")
async def download_file(
    request_id: int,
    file_id: int,
    db: AsyncSession = Depends(get_db),
    client: ApiClient = Security(get_current_client, scopes=_READ),
) -> FileResponse:
    req = await _owned_request(db, request_id, client)
    return await stored_file_response(db, req, file_id)


@router.post("/requests/{request_id}/resubmit", response_model=RequestDetail)
async def resubmit(
    request_id: int,
    data: RequestResubmit,
    db: AsyncSession = Depends(get_db),
    client: ApiClient = Security(get_current_client, scopes=_WRITE),
) -> RequestDetail:
    """Send a returned request back to the office once the student has supplied what was asked."""
    req = await _owned_request(db, request_id, client)
    await resubmit_returned(db, req, await _student_of(db, req), data.comment)
    await db.commit()
    return await _client_view(db, req.id)
