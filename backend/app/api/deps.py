from fastapi import Depends
from redis.asyncio import Redis

from app.core.redis import get_redis as _get_redis


async def get_redis_dep() -> Redis:
    return _get_redis()
