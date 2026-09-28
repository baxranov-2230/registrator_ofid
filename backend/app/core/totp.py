"""Time-based one-time passwords (RFC 6238), as used by authenticator apps.

Implemented directly on hmac: the algorithm is a dozen lines and a dependency
would add nothing but supply-chain surface.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

STEP_SECONDS = 30
DIGITS = 6
#: Accept the previous and next step too, to absorb clock drift on the phone.
DRIFT_STEPS = 1


def new_secret() -> str:
    """160-bit secret, base32 without padding — what authenticator apps expect."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code_at(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def current_code(secret: str, at: float | None = None) -> str:
    return _code_at(secret, int((at if at is not None else time.time()) // STEP_SECONDS))


def matching_step(secret: str, code: str, at: float | None = None) -> int | None:
    """The time step `code` belongs to, or None if it is not valid now.

    Returning the step lets the caller refuse a code that was already used,
    which the RFC requires and a plain boolean check cannot express.
    """
    code = (code or "").strip().replace(" ", "")
    if len(code) != DIGITS or not code.isdigit():
        return None
    now_step = int((at if at is not None else time.time()) // STEP_SECONDS)
    for step in range(now_step - DRIFT_STEPS, now_step + DRIFT_STEPS + 1):
        if hmac.compare_digest(_code_at(secret, step), code):
            return step
    return None


def provisioning_uri(secret: str, account: str, issuer: str) -> str:
    label = quote(f"{issuer}:{account}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&digits={DIGITS}"
