"""End-to-end coverage of the request workflow and its access rules."""

import pytest

from app.core.config import settings
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


async def test_full_lifecycle(client, login, seeded, monkeypatch, tmp_path):
    """student files → routed straight to staff (in_progress) → staff answers."""
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    student = await login(Role.STUDENT)
    staff = await login(Role.STAFF)

    req = await _create_request(client, student, seeded)
    assert req["status"] == "in_progress"
    assert req["assigned_to"] == seeded["user_ids"][Role.STAFF]
    assert req["tracking_no"].startswith("REQ-")
    assert req["is_overdue"] is False
    assert [h["new_status"] for h in req["history"]] == ["new", "in_progress"]

    resp = await client.post(
        f"/api/v1/requests/{req['id']}/answer",
        headers=staff,
        data={"text": "Ma'lumotnoma tayyor, ilovada."},
        files=[("files", ("malumotnoma.pdf", b"%PDF-1.4 test", "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "completed"
    assert body["closed_at"] is not None
    assert body["answer"]["text"] == "Ma'lumotnoma tayyor, ilovada."
    assert body["answer"]["answered_by"] == seeded["user_ids"][Role.STAFF]
    assert [f["file_name"] for f in body["answer"]["files"]] == ["malumotnoma.pdf"]

    # The student reads the outcome on their own copy of the request.
    mine = (await client.get(f"/api/v1/requests/{req['id']}", headers=student)).json()
    assert mine["answer"]["text"] == "Ma'lumotnoma tayyor, ilovada."


async def test_invalid_transition_rejected(client, login, seeded):
    student = await login(Role.STUDENT)
    registrator = await login(Role.REGISTRATOR)
    req = await _create_request(client, student, seeded)

    # Closing without an answer skips the workflow and must be refused.
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
