from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router, ws_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.redis import close_redis


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    yield
    await close_redis()


app = FastAPI(
    title="ROYD API",
    description="Registrator Ofis – Yagona Darcha Tizimi",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(ws_router)


@app.get("/healthz", tags=["system"])
async def healthz() -> dict:
    return {"status": "ok", "env": settings.env}
