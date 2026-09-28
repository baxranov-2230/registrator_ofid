"""Return/resubmit, closed-request guards, idempotency and partner webhooks."""

import hashlib
import hmac
import json
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config import settings
from app.models import OutboxMessage, Request, Student
from app.models.outbox import OutboxKind
from app.models.role import Role
from app.services import outbox_service
from app.services.outbox_service import sign


async def _file(client, headers, seeded, **extra_headers):
    resp = await client.post(
        "/api/v1/requests",
        headers={**headers, **extra_headers},
        json={"category_id": seeded["category_id"], "title": "Murojaat", "description": "Matn"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp


async def _transition(client, headers, request_id, status, comment=None):
    return await client.post(
        f"/api/v1/requests/{request_id}/transition",
        headers=headers,
        json={"status": status, "comment": comment},
    )


async def test_return_requires_a_reason(client, login, seeded):
    student = await login(Role.STUDENT)
    registrator = await login(Role.REGISTRATOR)
    req = (await _file(client, student, seeded)).json()
    resp = await _transition(client, registrator, req["id"], "returned")
    assert resp.status_code == 422


async def test_student_can_resubmit_a_returned_request(client, login, seeded, session_factory):
    student = await login(Role.STUDENT)
    registrator = await login(Role.REGISTRATOR)
    req = (await _file(client, student, seeded)).json()

    returned = await _transition(client, registrator, req["id"], "returned", "Hujjat yetishmaydi")
    assert returned.status_code == 200
    assert returned.json()["sla_paused_at"] is not None

    resp = await client.post(
        f"/api/v1/requests/{req['id']}/resubmit",
        headers=student,
        json={"comment": "Hujjatni yukladim"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "new"
    assert body["sla_paused_at"] is None
    # The paused time is given back, so the deadline cannot move earlier.
    assert body["sla_deadline"] >= req["sla_deadline"]


async def test_only_returned_requests_can_be_resubmitted(client, login, seeded):
    student = await login(Role.STUDENT)
    req = (await _file(client, student, seeded)).json()
    resp = await client.post(f"/api/v1/requests/{req['id']}/resubmit", headers=student, json={})
    assert resp.status_code == 409


async def test_closed_request_accepts_no_public_messages_or_files(client, login, seeded):
    student = await login(Role.STUDENT)
    registrator = await login(Role.REGISTRATOR)
    req = (await _file(client, student, seeded)).json()
    rejected = await _transition(client, registrator, req["id"], "rejected", "Asossiz")
    assert rejected.status_code == 200

    msg = await client.post(
        f"/api/v1/requests/{req['id']}/messages", headers=student, json={"content": "Nega?"}
    )
    assert msg.status_code == 409

    note = await client.post(
        f"/api/v1/requests/{req['id']}/messages",
        headers=registrator,
        json={"content": "Arxiv uchun eslatma", "is_internal": True},
    )
    assert note.status_code == 201

    upload = await client.post(
        f"/api/v1/requests/{req['id']}/files",
        headers=student,
        files={"upload": ("a.pdf", b"%PDF-1.4 test", "application/pdf")},
    )
    assert upload.status_code == 409


async def test_idempotency_key_prevents_duplicates(client, login, seeded):
    student = await login(Role.STUDENT)
    first = await _file(client, student, seeded, **{"Idempotency-Key": "partner-123"})
    again = await _file(client, student, seeded, **{"Idempotency-Key": "partner-123"})
    assert first.status_code == 201
    assert again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    assert first.json()["client_ref"] == "partner-123"

    listing = await client.get("/api/v1/requests", headers=student)
    assert listing.json()["total"] == 1


async def test_students_cannot_list_staff(client, login):
    student = await login(Role.STUDENT)
    assert (await client.get("/api/v1/users/assignees", headers=student)).status_code == 403


async def test_status_change_is_published_as_signed_webhook(
    client, login, seeded, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "webhook_url", "https://partner.test/hooks/royd")
    monkeypatch.setattr(settings, "webhook_secret", "s" * 40)

    student = await login(Role.STUDENT)
    registrator = await login(Role.REGISTRATOR)
    req = (await _file(client, student, seeded)).json()
    assert (await _transition(client, registrator, req["id"], "accepted")).status_code == 200

    async with session_factory() as db:
        rows = (
            (
                await db.execute(
                    select(OutboxMessage).where(OutboxMessage.kind == OutboxKind.WEBHOOK)
                )
            )
            .scalars()
            .all()
        )
    events = [r.payload["event"] for r in rows]
    assert events == ["request.created", "request.status_changed"]
    changed = rows[1].payload["data"]
    assert changed["status"] == "accepted"
    assert changed["old_status"] == "new"
    assert changed["student_hemis_id"] == "STU-TEST-1"

    sent: list[tuple[bytes, dict]] = []

    class _Resp:
        status_code = 200
        text = ""

    class _Client:
        def __init__(self, *a, **kw) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, content, headers):
            sent.append((content, headers))
            return _Resp()

    monkeypatch.setattr(outbox_service, "SessionLocal", session_factory)
    monkeypatch.setattr(outbox_service.httpx, "AsyncClient", _Client)

    async def _no_email(payload):
        return None

    monkeypatch.setitem(outbox_service._SENDERS, OutboxKind.EMAIL, _no_email)

    delivered = await outbox_service.deliver_pending(use_lock=False)
    assert delivered >= 2
    body, headers = sent[-1]
    expected = "sha256=" + hmac.new(b"s" * 40, body, hashlib.sha256).hexdigest()
    assert headers["X-ROYD-Signature"] == expected == sign(body, "s" * 40)
    assert json.loads(body)["event"] == "request.status_changed"

    # Delivered rows are not sent twice.
    assert await outbox_service.deliver_pending(use_lock=False) == 0


async def test_failed_delivery_is_retried_later(session_factory, monkeypatch, client):
    monkeypatch.setattr(outbox_service, "SessionLocal", session_factory)

    async def _boom(payload):
        raise RuntimeError("smtp down")

    monkeypatch.setitem(outbox_service._SENDERS, OutboxKind.EMAIL, _boom)
    async with session_factory() as db:
        await outbox_service.enqueue_email(db, "a@test.uz", "Mavzu", "Matn")
        await db.commit()

    assert await outbox_service.deliver_pending(use_lock=False) == 1
    async with session_factory() as db:
        row = (await db.execute(select(OutboxMessage))).scalar_one()
    assert row.status == "pending"
    assert row.attempts == 1
    assert "smtp down" in row.last_error
    next_attempt = row.next_attempt_at.replace(tzinfo=UTC)
    assert next_attempt > datetime.now(UTC)


async def test_hemis_login_stores_the_students_department(client, session_factory):
    resp = await client.post(
        "/api/v1/auth/login/hemis", json={"username": "STU001", "password": "student1"}
    )
    assert resp.status_code == 200, resp.text
    async with session_factory() as db:
        student = (
            await db.execute(select(Student).where(Student.external_student_id == "STU001"))
        ).scalar_one()
    assert student.department_id is not None


async def test_request_inherits_student_department(client, login, seeded, session_factory):
    student = await login(Role.STUDENT)
    req = (await _file(client, student, seeded)).json()
    async with session_factory() as db:
        row = await db.get(Request, req["id"])
    assert row.department_id == seeded["department_id"]
