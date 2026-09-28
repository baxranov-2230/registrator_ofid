"""SLA calendar (Reglament 7.3) and the SLA sweep (Reglament 7.2)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, update

from app.models import Notification, Request
from app.models.role import Role
from app.services import sla_service
from app.services.sla_calendar import (
    add_working_time,
    is_working_day,
    sla_deadline_from,
    working_time_between,
)

# 2026-09-25 is a Friday. Tashkent is UTC+5 all year.
FRIDAY_17_TASHKENT = datetime(2026, 9, 25, 12, 0, tzinfo=UTC)


def test_weekend_does_not_count() -> None:
    """Friday 17:00 + 48h lands on Tuesday 17:00, not Sunday."""
    deadline = sla_deadline_from(FRIDAY_17_TASHKENT, 48)
    assert deadline == datetime(2026, 9, 29, 12, 0, tzinfo=UTC)


def test_fixed_public_holiday_is_skipped() -> None:
    # 2026-10-01 (Thursday) is O'qituvchilar kuni, a day off.
    assert not is_working_day(datetime(2026, 10, 1).date())
    start = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)  # Wednesday 17:00 Tashkent
    # 24h: Wed 17:00-24:00 (7h), Thu skipped, Fri 00:00-17:00 (17h).
    assert add_working_time(start, timedelta(hours=24)) == datetime(2026, 10, 2, 12, 0, tzinfo=UTC)


def test_request_filed_on_weekend_starts_on_monday() -> None:
    saturday = datetime(2026, 9, 26, 5, 0, tzinfo=UTC)
    # Clock starts Monday 00:00 Tashkent = Sunday 19:00 UTC; +24h.
    assert sla_deadline_from(saturday, 24) == datetime(2026, 9, 28, 19, 0, tzinfo=UTC)


def test_working_time_between_ignores_weekend() -> None:
    elapsed = working_time_between(FRIDAY_17_TASHKENT, datetime(2026, 9, 28, 12, 0, tzinfo=UTC))
    # Fri 17:00-24:00 (7h) + Mon 00:00-17:00 (17h).
    assert elapsed == timedelta(hours=24)


@pytest.fixture
def sweep_db(monkeypatch, session_factory, client):
    """Point the sweep at the test database; `client` patches Redis."""
    monkeypatch.setattr(sla_service, "SessionLocal", session_factory)
    return session_factory


async def _file(client, login, seeded) -> int:
    student = await login(Role.STUDENT)
    resp = await client.post(
        "/api/v1/requests",
        headers=student,
        json={"category_id": seeded["category_id"], "title": "SLA test", "description": "Matn"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _set_deadline(session_factory, request_id: int, deadline: datetime) -> None:
    async with session_factory() as db:
        await db.execute(
            update(Request).where(Request.id == request_id).values(sla_deadline=deadline)
        )
        await db.commit()


async def _notification_count(session_factory) -> int:
    async with session_factory() as db:
        return (await db.execute(select(func.count()).select_from(Notification))).scalar_one()


async def test_breach_is_reported_once(client, login, seeded, sweep_db) -> None:
    request_id = await _file(client, login, seeded)
    await _set_deadline(sweep_db, request_id, datetime.now(UTC) - timedelta(hours=2))
    before = await _notification_count(sweep_db)

    first = await sla_service.sweep_sla_deadlines(use_lock=False)
    assert first == {"breached": 1, "warned": 0}
    after_first = await _notification_count(sweep_db)
    assert after_first > before

    second = await sla_service.sweep_sla_deadlines(use_lock=False)
    assert second == {"breached": 0, "warned": 0}
    assert await _notification_count(sweep_db) == after_first


async def test_already_breached_requests_do_not_starve_new_ones(
    client, login, seeded, sweep_db, monkeypatch
) -> None:
    """The old sweep re-read the same oldest batch forever once it was full."""
    monkeypatch.setattr(sla_service, "_BATCH", 1)
    old = await _file(client, login, seeded)
    new = await _file(client, login, seeded)
    now = datetime.now(UTC)
    await _set_deadline(sweep_db, old, now - timedelta(days=3))
    await _set_deadline(sweep_db, new, now - timedelta(hours=1))

    assert (await sla_service.sweep_sla_deadlines(use_lock=False))["breached"] == 1
    assert (await sla_service.sweep_sla_deadlines(use_lock=False))["breached"] == 1

    async with sweep_db() as db:
        marked = (
            await db.execute(select(func.count()).where(Request.sla_breached_at.is_not(None)))
        ).scalar_one()
    assert marked == 2


async def test_only_one_worker_runs_a_tick(client, sweep_db) -> None:
    assert (await sla_service.sweep_sla_deadlines())["breached"] == 0
    # The second call in the same tick finds the lock taken and does nothing,
    # even though it would otherwise query the database.
    from app.core.locks import claim

    assert await claim("sla_sweep", 60) is False


async def test_returned_request_is_not_overdue(client, login, seeded, sweep_db) -> None:
    request_id = await _file(client, login, seeded)
    registrator = await login(Role.REGISTRATOR)
    resp = await client.post(
        f"/api/v1/requests/{request_id}/transition",
        headers=registrator,
        json={"status": "returned", "comment": "Pasport nusxasini yuklang"},
    )
    assert resp.status_code == 200, resp.text
    await _set_deadline(sweep_db, request_id, datetime.now(UTC) - timedelta(hours=5))

    assert (await sla_service.sweep_sla_deadlines(use_lock=False))["breached"] == 0
    detail = await client.get(f"/api/v1/requests/{request_id}", headers=registrator)
    assert detail.json()["is_overdue"] is False
