import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router, ws_router
from app.api.v1.ws import start_pubsub_listener, stop_pubsub_listener
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import setup_logging
from app.core.redis import close_redis
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.services.notification_service import drain_pending_emails
from app.services.sla_service import sweep_sla_deadlines

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()

    if settings.hemis_use_mock:
        log.warning(
            "HEMIS_USE_MOCK is ENABLED — any username with any non-empty password "
            "will authenticate. This must never be set outside development."
        )

    await start_pubsub_listener()

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        sweep_sla_deadlines,
        trigger=IntervalTrigger(minutes=settings.sla_check_interval_minutes),
        id="sla_sweep",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    log.info("SLA sweep scheduled every %d minutes", settings.sla_check_interval_minutes)

    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
        await stop_pubsub_listener()
        await drain_pending_emails()
        await close_redis()


# Interactive docs expose the entire API surface, including admin routes, to
# anonymous callers — fine in dev, not in production (B-10).
_docs_enabled = settings.is_dev

app = FastAPI(
    title="ROYD API",
    description="Registrator Ofis – Yagona Darcha Tizimi",
    version="0.1.0",
    docs_url="/api/docs" if _docs_enabled else None,
    redoc_url="/api/redoc" if _docs_enabled else None,
    openapi_url="/api/openapi.json" if _docs_enabled else None,
    lifespan=lifespan,
)

register_exception_handlers(app)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

# A wildcard origin combined with allow_credentials makes Starlette echo back
# whichever Origin asked, which is every origin. Settings validation rejects
# "*" outside dev (B-03/B-04); this keeps the dev case honest too.
#
# Note for the refresh cookie: allow_credentials is off under a wildcard, so a
# cross-origin browser will not send it. Both compose files serve the frontend
# and API from one origin (VITE_API_URL="") via nginx, so this never bites in
# practice — but a dev pointing VITE_API_URL at a different origin must list
# that origin explicitly in CORS_ORIGINS instead of using "*", or the session
# will not survive a reload.
_origins = settings.cors_origins_list
_allow_all = "*" in _origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _origins,
    allow_credentials=not _allow_all,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Accept-Language"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
    max_age=600,
)

app.include_router(api_router)
app.include_router(ws_router)


@app.get("/healthz", tags=["system"])
async def healthz() -> dict:
    return {"status": "ok", "env": settings.env}
