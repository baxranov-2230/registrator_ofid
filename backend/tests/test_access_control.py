"""Regression tests for the access-control findings in the audit.

Each test here corresponds to a specific defect. They exist so the same hole
cannot be reopened silently.
"""

import pytest

from app.models.role import Role


async def _new_request(client, headers, seeded):
    resp = await client.post(
        "/api/v1/requests",
        headers=headers,
        json={
            "category_id": seeded["category_id"],
            "title": "Ichki eslatma sinovi",
            "description": "Matn",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_internal_notes_are_hidden_from_the_student(client, login, seeded):
    """B-01: staff-only notes must never reach the student who owns the request."""
    student = await login(Role.STUDENT)
    registrator = await login(Role.REGISTRATOR)
    req = await _new_request(client, student, seeded)

    posted = await client.post(
        f"/api/v1/requests/{req['id']}/messages",
        headers=registrator,
        json={"content": "Bu faqat xodimlar uchun eslatma", "is_internal": True},
    )
    assert posted.status_code == 201

    public = await client.post(
        f"/api/v1/requests/{req['id']}/messages",
        headers=registrator,
        json={"content": "Hujjatingiz tayyor", "is_internal": False},
    )
    assert public.status_code == 201

    as_student = (await client.get(f"/api/v1/requests/{req['id']}", headers=student)).json()
    contents = [m["content"] for m in as_student["messages"]]
    assert "Hujjatingiz tayyor" in contents
    assert not any(m["is_internal"] for m in as_student["messages"])
    assert "Bu faqat xodimlar uchun eslatma" not in contents

    # Staff still see both.
    as_registrator = (await client.get(f"/api/v1/requests/{req['id']}", headers=registrator)).json()
    assert len(as_registrator["messages"]) == 2


async def test_student_cannot_post_internal_note(client, login, seeded):
    student = await login(Role.STUDENT)
    req = await _new_request(client, student, seeded)
    resp = await client.post(
        f"/api/v1/requests/{req['id']}/messages",
        headers=student,
        json={"content": "yashirin", "is_internal": True},
    )
    assert resp.status_code == 403


async def test_student_cannot_read_another_students_request(client, login, seeded, session_factory):
    """Row-level scoping, not just the role gate."""
    student = await login(Role.STUDENT)
    req = await _new_request(client, student, seeded)

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.core.security import create_access_token
    from app.models import User

    async with session_factory() as db:
        other = (
            await db.execute(
                select(User)
                .where(User.id == seeded["other_student_id"])
                .options(selectinload(User.role))
            )
        ).scalar_one()
        # Empty sid == no idle-window bookkeeping, so this exercises the row
        # level check rather than the session check.
        token = create_access_token(other, "")

    resp = await client.get(
        f"/api/v1/requests/{req['id']}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


async def test_leadership_is_read_only(client, login, seeded):
    """A-02: leadership sees everything and changes nothing."""
    student = await login(Role.STUDENT)
    leadership = await login(Role.LEADERSHIP)
    req = await _new_request(client, student, seeded)

    assert (await client.get("/api/v1/requests", headers=leadership)).status_code == 200
    assert (
        await client.get(f"/api/v1/requests/{req['id']}", headers=leadership)
    ).status_code == 200

    assert (
        await client.post(
            f"/api/v1/requests/{req['id']}/assign",
            headers=leadership,
            json={"assignee_id": seeded["user_ids"][Role.STAFF]},
        )
    ).status_code == 403
    assert (
        await client.post(
            f"/api/v1/requests/{req['id']}/transition",
            headers=leadership,
            json={"status": "accepted"},
        )
    ).status_code == 403
    assert (
        await client.post(
            "/api/v1/admin/faculties",
            headers=leadership,
            json={"name": "Yangi fakultet", "code": "NEW"},
        )
    ).status_code == 403


async def test_staff_cannot_touch_unassigned_request(client, login, seeded):
    student = await login(Role.STUDENT)
    staff = await login(Role.STAFF)
    req = await _new_request(client, student, seeded)

    assert (await client.get(f"/api/v1/requests/{req['id']}", headers=staff)).status_code == 403


async def test_admin_cannot_deactivate_or_demote_self(client, login, seeded):
    """B-11: the last admin must not be able to lock everyone out."""
    admin = await login(Role.ADMIN)
    admin_id = seeded["user_ids"][Role.ADMIN]

    assert (
        await client.patch(f"/api/v1/users/{admin_id}", headers=admin, json={"is_active": False})
    ).status_code == 400
    assert (
        await client.patch(
            f"/api/v1/users/{admin_id}", headers=admin, json={"role_name": Role.STUDENT}
        )
    ).status_code == 400
    assert (await client.delete(f"/api/v1/users/{admin_id}", headers=admin)).status_code == 400


async def test_duplicate_email_returns_409_not_500(client, login):
    """D-03: the unique constraint surfaces as a conflict, not a crash."""
    admin = await login(Role.ADMIN)
    payload = {
        "full_name": "Yangi Xodim",
        "email": "yangi@test.uz",
        "password": "parol12345",
        "role_name": Role.STAFF,
    }
    assert (await client.post("/api/v1/users", headers=admin, json=payload)).status_code == 201
    assert (await client.post("/api/v1/users", headers=admin, json=payload)).status_code == 409


@pytest.mark.parametrize(
    "path",
    ["/api/v1/requests", "/api/v1/users", "/api/v1/notifications", "/api/v1/stats/dashboard"],
)
async def test_endpoints_require_authentication(client, path):
    assert (await client.get(path)).status_code == 401
