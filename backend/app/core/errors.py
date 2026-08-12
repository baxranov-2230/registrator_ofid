"""Global exception handlers (D-03).

Before this, a duplicate email or faculty code escaped as an unhandled
IntegrityError: HTTP 500 plus a full stack trace in the log. Uniqueness is
enforced by the database — the pre-flight SELECT in the endpoints is a
courtesy, not a guarantee — so the constraint violation is a normal, expected
outcome and deserves a 409.
"""

import logging
import uuid

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.config import settings

log = logging.getLogger(__name__)

# Maps a constraint name fragment to the message the user should see.
_CONSTRAINT_MESSAGES = {
    "users_email_key": "Bu email allaqachon ro'yxatdan o'tgan",
    "users_external_student_id_key": "Bu talaba ID allaqachon mavjud",
    "faculties_code_key": "Bu fakultet kodi allaqachon band",
    "faculties_name_key": "Bu nomdagi fakultet allaqachon mavjud",
    "requests_tracking_no_key": "Murojaat raqami to'qnashdi, qayta urinib ko'ring",
    "roles_name_key": "Bu rol allaqachon mavjud",
}


def _integrity_message(exc: IntegrityError) -> str:
    detail = str(getattr(exc, "orig", exc))
    for fragment, message in _CONSTRAINT_MESSAGES.items():
        if fragment in detail:
            return message
    if "foreign key" in detail.lower():
        return "Bog'liq yozuv topilmadi yoki o'chirib bo'lmaydi"
    return "Ma'lumot bazasidagi cheklovga zid — qiymat allaqachon mavjud"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(IntegrityError)
    async def _integrity(request: Request, exc: IntegrityError) -> JSONResponse:
        log.warning("IntegrityError on %s %s: %s", request.method, request.url.path, exc.orig)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": _integrity_message(exc)},
        )

    @app.exception_handler(SQLAlchemyError)
    async def _database(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        ref = uuid.uuid4().hex[:12]
        log.exception("Database error [%s] on %s %s", ref, request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": f"Ma'lumotlar bazasi vaqtincha mavjud emas (ref: {ref})"},
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # A reference id ties the user-visible message to the log entry without
        # leaking internals to the caller.
        ref = uuid.uuid4().hex[:12]
        log.exception("Unhandled error [%s] on %s %s", ref, request.method, request.url.path)
        detail = f"{type(exc).__name__}: {exc}" if settings.is_dev else "Ichki xatolik"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": detail, "ref": ref},
        )
