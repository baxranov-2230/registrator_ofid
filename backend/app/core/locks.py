"""Cluster-wide "only one worker does this" guard for scheduled jobs.

Production runs several uvicorn workers and every worker starts its own
scheduler, so each periodic job fired once per worker — four SLA sweeps racing
each other and sending the same breach notice four times. A job now first
claims a Redis key with SET NX; whoever wins runs, the rest skip this tick.

The key is left to expire rather than deleted, so the claim also covers the
rest of the interval: a worker whose clock ticks a few seconds later cannot
start a second run of the same tick.
"""

import logging
import secrets

from app.core.redis import get_redis

log = logging.getLogger(__name__)

_PREFIX = "joblock:"


async def claim(name: str, ttl_seconds: int) -> bool:
    """True if this worker won the right to run job `name` for `ttl_seconds`."""
    try:
        won = await get_redis().set(
            f"{_PREFIX}{name}", secrets.token_hex(8), nx=True, ex=max(1, ttl_seconds)
        )
    except Exception as exc:
        # Without Redis there is no coordination; skipping is safer than every
        # worker running the job at once.
        log.warning("Could not claim job lock %s: %s", name, exc)
        return False
    return bool(won)
