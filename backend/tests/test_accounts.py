"""Passwords, 2FA, admin user management and login throttling."""

import re
import time

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from starlette.requests import Request as StarletteRequest

from app.core.config import settings
from app.core.security import check_brute_force, client_ip
from app.core.totp import current_code
from app.models import OutboxMessage
from app.models.role import Role


def _request_with_headers(headers: dict[str, str]) -> StarletteRequest:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": ("10.0.0.9", 1234),
    }
    return StarletteRequest(scope)


def test_client_ip_ignores_client_supplied_forwarded_for() -> None:
    """The first X-Forwarded-For entry is whatever the client wrote."""
    req = _request_with_headers({"X-Forwarded-For": "1.2.3.4", "X-Real-IP": "203.0.113.7"})
    assert client_ip(req) == "203.0.113.7"
    assert client_ip(_request_with_headers({"X-Forwarded-For": "1.2.3.4"})) == "10.0.0.9"


async def test_account_is_locked_after_too_many_failures(fake_redis) -> None:
    await fake_redis.set("login:fail:user:victim@test.uz", str(settings.login_lockout_attempts))
    with pytest.raises(HTTPException) as exc:
        await check_brute_force(fake_redis, identity="victim@test.uz", ip="198.51.100.1")
    assert exc.value.status_code == 429


async def test_weak_password_is_rejected(client, login):
    admin = await login(Role.ADMIN)
    resp = await client.post(
        "/api/v1/users",
        headers=admin,
        json={
            "full_name": "Yangi xodim",
            "email": "new@test.uz",
            "password": "qisqa1",
            "role_name": "staff",
        },
    )
    assert resp.status_code == 422


async def test_admin_can_unbind_a_registrator_from_a_faculty(client, login, seeded):
    admin = await login(Role.ADMIN)
    reg_id = seeded["user_ids"][Role.REGISTRATOR]
    resp = await client.patch(f"/api/v1/users/{reg_id}", headers=admin, json={"faculty_id": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["faculty_id"] is None

    # Leaving the field out leaves it alone.
    await client.patch(
        f"/api/v1/users/{reg_id}", headers=admin, json={"faculty_id": seeded["faculty_id"]}
    )
    resp = await client.patch(f"/api/v1/users/{reg_id}", headers=admin, json={"full_name": "Reg"})
    assert resp.json()["faculty_id"] == seeded["faculty_id"]


async def test_user_directory_is_paginated_and_searchable(client, login):
    admin = await login(Role.ADMIN)
    resp = await client.get("/api/v1/users", headers=admin, params={"role": "student", "limit": 1})
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 1

    found = await client.get("/api/v1/users", headers=admin, params={"search": "STU-TEST-2"})
    assert [u["full_name"] for u in found.json()["items"]] == ["Boshqa talaba"]


async def test_unread_count(client, login, seeded):
    student = await login(Role.STUDENT)
    await client.post(
        "/api/v1/requests",
        headers=student,
        json={"category_id": seeded["category_id"], "title": "Murojaat", "description": "Matn"},
    )
    # The request is routed straight to the staff member, who is notified.
    staff = await login(Role.STAFF)
    count = (await client.get("/api/v1/notifications/unread-count", headers=staff)).json()
    assert count["count"] >= 1
    await client.patch("/api/v1/notifications/read-all", headers=staff)
    count = (await client.get("/api/v1/notifications/unread-count", headers=staff)).json()
    assert count["count"] == 0


async def test_change_password_signs_out_other_sessions(client, login):
    other_session = await client.post(
        "/api/v1/auth/login", json={"email": "staff@test.uz", "password": "parol12345"}
    )
    old_refresh = other_session.json()["refresh_token"]
    headers = await login(Role.STAFF)

    resp = await client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "parol12345", "new_password": "YangiParol2026"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]

    client.cookies.clear()
    stale = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert stale.status_code == 401

    relogin = await client.post(
        "/api/v1/auth/login", json={"email": "staff@test.uz", "password": "YangiParol2026"}
    )
    assert relogin.status_code == 200


async def test_forgot_and_reset_password(client, session_factory):
    resp = await client.post("/api/v1/auth/password/forgot", json={"email": "staff@test.uz"})
    assert resp.status_code == 204
    unknown = await client.post("/api/v1/auth/password/forgot", json={"email": "no@test.uz"})
    assert unknown.status_code == 204  # no account enumeration

    async with session_factory() as db:
        mails = (await db.execute(select(OutboxMessage))).scalars().all()
    reset_mails = [m for m in mails if "tiklash" in m.payload["subject"]]
    assert len(reset_mails) == 1
    token = re.search(r"token=([\w-]+)", reset_mails[0].payload["body"]).group(1)

    done = await client.post(
        "/api/v1/auth/password/reset", json={"token": token, "new_password": "Tiklangan2026"}
    )
    assert done.status_code == 204
    reused = await client.post(
        "/api/v1/auth/password/reset", json={"token": token, "new_password": "Boshqasi2026"}
    )
    assert reused.status_code == 400

    login = await client.post(
        "/api/v1/auth/login", json={"email": "staff@test.uz", "password": "Tiklangan2026"}
    )
    assert login.status_code == 200


async def test_two_factor_login(client, login):
    headers = await login(Role.ADMIN)
    setup = await client.post("/api/v1/auth/2fa/setup", headers=headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["qr_svg"].startswith("data:image/svg+xml")

    bad = await client.post("/api/v1/auth/2fa/enable", headers=headers, json={"code": "000000"})
    assert bad.status_code == 400
    ok = await client.post(
        "/api/v1/auth/2fa/enable", headers=headers, json={"code": current_code(secret)}
    )
    assert ok.status_code == 204

    first = await client.post(
        "/api/v1/auth/login", json={"email": "admin@test.uz", "password": "parol12345"}
    )
    body = first.json()
    assert body["mfa_required"] is True
    assert body["access_token"] is None

    # The code used to enable is burnt; the next step's code is accepted.
    next_code = current_code(secret, at=time.time() + 30)
    second = await client.post(
        "/api/v1/auth/login/2fa", json={"mfa_token": body["mfa_token"], "code": next_code}
    )
    assert second.status_code == 200, second.text
    assert second.json()["access_token"]

    replay = await client.post(
        "/api/v1/auth/login/2fa", json={"mfa_token": body["mfa_token"], "code": next_code}
    )
    assert replay.status_code == 401


async def test_mfa_token_is_not_an_access_token(client, login):
    headers = await login(Role.ADMIN)
    secret = (await client.post("/api/v1/auth/2fa/setup", headers=headers)).json()["secret"]
    await client.post(
        "/api/v1/auth/2fa/enable", headers=headers, json={"code": current_code(secret)}
    )
    mfa_token = (
        await client.post(
            "/api/v1/auth/login", json={"email": "admin@test.uz", "password": "parol12345"}
        )
    ).json()["mfa_token"]
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {mfa_token}"})
    assert resp.status_code == 401
