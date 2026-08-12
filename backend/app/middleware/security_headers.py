"""Baseline security response headers (E-02).

These belong at the edge too, but setting them here means they hold even when
the API is reached directly — during local development, from a health checker,
or if the proxy config drifts.
"""

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import settings

_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for header, value in _HEADERS.items():
            response.headers.setdefault(header, value)

        if not settings.is_dev:
            # Only meaningful over TLS, and actively harmful on a plain-HTTP dev box.
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response
