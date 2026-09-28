from fastapi import APIRouter

from app.api.v1 import (
    admin,
    api_clients,
    auth,
    catalogs,
    integration,
    notifications,
    reports,
    requests,
    stats,
    users,
    ws,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(catalogs.router)
api_router.include_router(catalogs.admin_router)
api_router.include_router(requests.router)
api_router.include_router(notifications.router)
api_router.include_router(stats.router)
api_router.include_router(reports.router)
api_router.include_router(admin.router)
api_router.include_router(api_clients.router)
api_router.include_router(integration.oauth_router)
api_router.include_router(integration.router)

ws_router = APIRouter()
ws_router.include_router(ws.router)
