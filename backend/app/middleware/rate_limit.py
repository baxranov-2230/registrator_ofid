"""Redis-backed fixed-window rate limiting (B-06).

Configured but unimplemented until now: `settings.rate_limit_per_minute`
existed and was never read. Writes are the expensive operations here — a script
creating requests in a loop fills both the database and the staff queue — so
mutating verbs get a tighter budget than reads.
"""

import logging
import time

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import settings
from app.core.redis import get_redis
from app.core.security import client_ip

log = logging.getLogger(__name__)

# Auth endpoints carry their own dedicated brute-force counters (B-05); the
# health probe must never be throttled or the container is marked unhealthy.
_EXEMPT_PATHS = ("/healthz", "/api/docs", "/api/redoc", "/api/openapi.json")
_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if request.method == "OPTIONS" or path.startswith(_EXEMPT_PATHS):
            return await call_next(request)

        limit = settings.rate_limit_per_minute
        if request.method in _WRITE_METHODS:
            limit = max(1, limit // 4)

        # Prefer the authenticated subject so users behind one NAT do not share
        # a bucket; fall back to IP for anonymous traffic.
        identity = request.headers.get("authorization", "")[-32:] or client_ip(request)
        bucket = int(time.time() // 60)
        key = f"ratelimit:{(request.method in _WRITE_METHODS and 'w') or 'r'}:{identity}:{bucket}"

        try:
            redis = get_redis()
            pipe = redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, 120)
            count, _ = await pipe.execute()
        except Exception as exc:
            # Redis being down must not take the API down with it.
            log.warning("Rate limiter unavailable, allowing request: %s", exc)
            return await call_next(request)

        if int(count) > limit:
            retry_after = 60 - int(time.time() % 60)
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "So'rovlar chegarasi oshib ketdi. Biroz kuting."},
                headers={"Retry-After": str(retry_after)},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - int(count)))
        return response
