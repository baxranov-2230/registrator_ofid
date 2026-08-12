"""End-to-end coverage of the request workflow and its access rules."""

import pytest

from app.models.role import Role


async def _create_request(client, headers, seeded, title="Ma'lumotnoma kerak"):
    resp = await client.post(
        "/api/v1/requests",
        headers=headers,
        json={
            "category_id": seeded["category_id"],
            "title": title,
            "description": "Iltimos ma'lumotnoma tayyorlab bering.",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_full_lifecycle(client, login, seeded):
    """student creates → registrator assigns → staff works it → completed."""
    student = await login(Role.STUDENT)
    registrator = await login(Role.REGISTRATOR)
    staff = await login(Role.STAFF)

    req = await _create_request(client, student, seeded)
    assert req["status"] == "new"
    assert req["tracking_no"].startswith("REQ-")
    assert req["is_overdue"] is False

    assign = await client.post(
        f"/api/v1/requests/{req['id']}/assign",
        headers=registrator,
        json={"assignee_id": seeded["user_ids"][Role.STAFF]},
    )
    assert assign.status_code == 200, assign.text

    for target in ("accepted", "in_progress", "completed"):
        resp = await client.post(
            f"/api/v1/requests/{req['id']}/transition",
            headers=staff,
            json={"status": target},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == target

    assert (await client.get(f"/api/v1/requests/{req['id']}", headers=staff)).json()[
        "closed_at"
    ] is not None


async def test_invalid_transition_rejected(client, login, seeded):
    student = await login(Role.STUDENT)
    registrator = await login(Role.REGISTRATOR)
    req = await _create_request(client, student, seeded)

    # new → completed skips the workflow and must be refused.
    resp = await client.post(
        f"/api/v1/requests/{req['id']}/transition",
        headers=registrator,
        json={"status": "completed"},
    )
    assert resp.status_code == 400


async def test_unknown_status_filter_is_422(client, login):
    headers = await login(Role.REGISTRATOR)
    resp = await client.get("/api/v1/requests", headers=headers, params={"status": "bogus"})
    assert resp.status_code == 422


async def test_list_is_paginated_with_total(client, login, seeded):
    student = await login(Role.STUDENT)
    for i in range(3):
        await _create_request(client, student, seeded, title=f"Murojaat {i}")

    resp = await client.get("/api/v1/requests", headers=student, params={"limit": 2})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["limit"] == 2 and body["offset"] == 0


@pytest.mark.parametrize("role", [Role.STUDENT, Role.STAFF, Role.LEADERSHIP])
async def test_only_students_may_create(client, login, seeded, role):
    headers = await login(role)
    resp = await client.post(
        "/api/v1/requests",
        headers=headers,
        json={
            "category_id": seeded["category_id"],
            "title": "Test murojaat",
            "description": "Matn",
        },
    )
    assert resp.status_code == (201 if role == Role.STUDENT else 403)
