"""Test harness: real FastAPI app, SQLite-backed database, fake Redis.

Integration tests over the actual routes catch far more than unit tests here —
most of the audit's findings lived in the wiring between layers, not inside a
single function.
"""

import os
from collections.abc import AsyncIterator

os.environ.setdefault("ENV", "dev")
os.environ.setdefault("HEMIS_USE_MOCK", "true")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import get_db
from app.core.redis import get_redis
from app.core.security import hash_password
from app.main import app
from app.models import Base, Department, Faculty, RequestCategory, Role, User

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


class FakeRedis:
    """Minimal in-memory stand-in for the Redis calls the app makes."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.published: list[tuple[str, str]] = []

    async def incr(self, key: str) -> int:
        value = int(self.store.get(key, 0)) + 1
        self.store[key] = str(value)
        return value

    async def get(self, key: str):
        return self.store.get(key)

    async def mget(self, *keys):
        flat = keys[0] if len(keys) == 1 and isinstance(keys[0], list | tuple) else keys
        return [self.store.get(k) for k in flat]

    async def set(self, key: str, value) -> bool:
        self.store[key] = str(value)
        return True

    async def setex(self, key: str, _ttl: int, value) -> bool:
        self.store[key] = str(value)
        return True

    async def expire(self, *_args, **_kwargs) -> bool:
        return True

    async def exists(self, key: str) -> int:
        return 1 if key in self.store else 0

    async def delete(self, *keys) -> int:
        removed = 0
        for key in keys:
            removed += 1 if self.store.pop(key, None) is not None else 0
        return removed

    async def publish(self, channel: str, message: str) -> int:
        self.published.append((channel, message))
        return 0

    def pipeline(self) -> "FakePipeline":
        return FakePipeline(self)

    def pubsub(self):
        raise NotImplementedError

    async def aclose(self) -> None:
        return None


class FakePipeline:
    def __init__(self, redis: FakeRedis) -> None:
        self.redis = redis
        self.ops: list[tuple[str, tuple]] = []

    def incr(self, key: str) -> "FakePipeline":
        self.ops.append(("incr", (key,)))
        return self

    def expire(self, key: str, ttl: int) -> "FakePipeline":
        self.ops.append(("expire", (key, ttl)))
        return self

    async def execute(self) -> list:
        results = []
        for op, args in self.ops:
            results.append(await getattr(self.redis, op)(*args))
        self.ops.clear()
        return results


@pytest.fixture
def fake_redis() -> FakeRedis:
    return FakeRedis()


@pytest.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker]:
    engine = create_async_engine(TEST_DB_URL, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
async def seeded(session_factory) -> dict:
    """Roles, one faculty/department/category and one user per role."""
    async with session_factory() as db:
        roles = {name: Role(name=name, description=name, permissions={}) for name in Role.ALL}
        db.add_all(roles.values())
        await db.flush()

        faculty = Faculty(name="Axborot texnologiyalari", code="IT", is_active=True)
        db.add(faculty)
        await db.flush()

        dept = Department(faculty_id=faculty.id, name="Dasturiy injiniring", code="DI")
        category = RequestCategory(
            name="Ma'lumotnoma", sla_hours=48, priority="normal", is_active=True
        )
        db.add_all([dept, category])
        await db.flush()

        users = {}
        for role_name in Role.ALL:
            user = User(
                full_name=f"Test {role_name}",
                email=f"{role_name}@test.uz",
                password_hash=hash_password("parol12345"),
                role_id=roles[role_name].id,
                faculty_id=faculty.id,
                is_active=True,
            )
            db.add(user)
            users[role_name] = user
        await db.flush()

        # A second student, to prove cross-tenant reads are refused.
        other = User(
            full_name="Boshqa talaba",
            email="student2@test.uz",
            password_hash=hash_password("parol12345"),
            role_id=roles[Role.STUDENT].id,
            is_active=True,
        )
        db.add(other)
        await db.commit()

        return {
            "user_ids": {name: u.id for name, u in users.items()},
            "other_student_id": other.id,
            "faculty_id": faculty.id,
            "department_id": dept.id,
            "category_id": category.id,
        }


@pytest.fixture
async def client(session_factory, fake_redis, seeded) -> AsyncIterator[AsyncClient]:
    async def _get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_redis] = lambda: fake_redis

    # The app's own modules reach for Redis directly in a few places.
    import app.core.redis as redis_module

    original = redis_module._redis
    redis_module._redis = fake_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    redis_module._redis = original
    app.dependency_overrides.clear()


@pytest.fixture
def login(client, seeded):
    async def _login(role: str) -> dict[str, str]:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": f"{role}@test.uz", "password": "parol12345"},
        )
        assert resp.status_code == 200, resp.text
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    return _login
