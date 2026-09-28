import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router, ws_router
from app.api.v1.ws import start_pubsub_listener, stop_pubsub_listener
from app.core.config import settings
from app.core.db import engine
from app.core.errors import register_exception_handlers
from app.core.logging import setup_logging
from app.core.redis import close_redis, get_redis
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.services.outbox_service import deliver_pending
from app.services.sla_service import sweep_sla_deadlines

log = logging.getLogger(__name__)

if settings.sentry_dsn:
    # Imported only when configured, so the dependency stays optional at runtime.
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        traces_sample_rate=0.0,
        # Request bodies carry student data; keep them out of the error tracker.
        send_default_pii=False,
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()

    await start_pubsub_listener()

    # Every uvicorn worker starts this scheduler. Each job claims a Redis lock
    # before doing anything, so per tick exactly one worker actually runs it.
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        sweep_sla_deadlines,
        trigger=IntervalTrigger(minutes=settings.sla_check_interval_minutes),
        id="sla_sweep",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        deliver_pending,
        trigger=IntervalTrigger(seconds=settings.outbox_interval_seconds),
        id="outbox",
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
    """Liveness: the process is up. Deliberately checks nothing else, so a
    database blip does not get every backend container restarted at once."""
    return {"status": "ok", "env": settings.env}


@app.get("/readyz", tags=["system"])
async def readyz() -> JSONResponse:
    """Readiness: can this instance actually serve requests right now?"""
    checks: dict[str, str] = {}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {type(exc).__name__}"
    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {type(exc).__name__}"
    healthy = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "degraded", "checks": checks},
    )
