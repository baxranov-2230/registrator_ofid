"""An automatic answer's description ("Tasnifi") and files."""

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import OutboxMessage, Role
from app.models.outbox import OutboxKind
from app.services import catalog_service

PDF = b"%PDF-1.4 kontrakt"


@pytest.fixture(autouse=True)
def _storage(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))


async def _auto_service(client, admin, seeded, **fields) -> dict:
    resp = await client.post(
        "/api/v1/admin/categories",
        headers=admin,
        json={
            "parent_id": seeded["service_type_id"],
            "name": "Kontrakt",
            "routing": "auto_reply",
            "auto_reply_text": "Kontrakt summasi ilovada.",
            **fields,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _upload(client, headers, category_id: int, name: str = "kontrakt.pdf"):
    return await client.post(
        f"/api/v1/admin/categories/{category_id}/files",
        headers=headers,
        files={"upload": (name, PDF, "application/pdf")},
    )


async def _file(client, headers, category_id: int) -> dict:
    resp = await client.post(
        "/api/v1/requests",
        headers=headers,
        json={"category_id": category_id, "title": "Kontrakt", "description": "Summasi qancha?"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_auto_reply_sends_its_description_and_files(
    client, login, seeded, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "webhook_url", "https://partner.test/hooks/royd")
    monkeypatch.setattr(settings, "webhook_secret", "s" * 40)
    admin = await login(Role.ADMIN)
    service = await _auto_service(
        client, admin, seeded, auto_reply_description="  To'lov bo'yicha ma'lumot  "
    )
    assert service["auto_reply_description"] == "To'lov bo'yicha ma'lumot"

    uploaded = await _upload(client, admin, service["id"])
    assert uploaded.status_code == 201, uploaded.text
    listed = (
        await client.get(f"/api/v1/admin/categories/{service['id']}/files", headers=admin)
    ).json()
    assert [f["file_name"] for f in listed] == ["kontrakt.pdf"]

    student = await login(Role.STUDENT)
    req = await _file(client, student, service["id"])
    assert req["status"] == "completed"
    answer = req["answer"]
    assert answer["description"] == "To'lov bo'yicha ma'lumot"
    assert answer["text"] == "Kontrakt summasi ilovada."
    assert [f["file_name"] for f in answer["files"]] == ["kontrakt.pdf"]
    assert answer["files"][0]["is_answer"] is True

    download = await client.get(
        f"/api/v1/requests/{req['id']}/files/{answer['files'][0]['id']}", headers=student
    )
    assert download.status_code == 200
    assert download.content == PDF

    async with session_factory() as db:
        rows = (
            (
                await db.execute(
                    select(OutboxMessage)
                    .where(OutboxMessage.kind == OutboxKind.WEBHOOK)
                    .order_by(OutboxMessage.id)
                )
            )
            .scalars()
            .all()
        )
    assert [r.payload["event"] for r in rows] == [
        "request.created",
        "request.file_added",
        "request.status_changed",
    ]
    added = rows[1].payload["data"]["file"]
    assert added["is_answer"] is True
    assert added["from_student"] is False
    sent = rows[2].payload["data"]["answer"]
    assert sent["description"] == "To'lov bo'yicha ma'lumot"
    assert [f["id"] for f in sent["files"]] == [answer["files"][0]["id"]]


async def test_files_go_only_on_auto_reply_services(client, login, seeded):
    admin = await login(Role.ADMIN)
    # A faculty-routed service would store the file and never send it.
    assert (await _upload(client, admin, seeded["category_id"])).status_code == 400
    # Nor does a request type answer anything.
    assert (await _upload(client, admin, seeded["service_type_id"])).status_code == 400

    service = await _auto_service(client, admin, seeded)
    registrator = await login(Role.REGISTRATOR)
    assert (await _upload(client, registrator, service["id"])).status_code == 403


async def test_answer_file_cap_applies(client, login, seeded, monkeypatch):
    monkeypatch.setattr(catalog_service, "MAX_ANSWER_FILES", 1)
    admin = await login(Role.ADMIN)
    service = await _auto_service(client, admin, seeded)
    assert (await _upload(client, admin, service["id"], "a.pdf")).status_code == 201
    assert (await _upload(client, admin, service["id"], "b.pdf")).status_code == 422


async def test_removed_file_stays_with_earlier_answers(client, login, seeded):
    admin = await login(Role.ADMIN)
    service = await _auto_service(client, admin, seeded)
    file_id = (await _upload(client, admin, service["id"])).json()["id"]

    student = await login(Role.STUDENT)
    earlier = await _file(client, student, service["id"])

    resp = await client.delete(
        f"/api/v1/admin/categories/{service['id']}/files/{file_id}", headers=admin
    )
    assert resp.status_code == 204
    listed = (
        await client.get(f"/api/v1/admin/categories/{service['id']}/files", headers=admin)
    ).json()
    assert listed == []

    later = await _file(client, student, service["id"])
    assert later["answer"]["files"] == []

    kept = earlier["answer"]["files"][0]
    download = await client.get(
        f"/api/v1/requests/{earlier['id']}/files/{kept['id']}", headers=student
    )
    assert download.status_code == 200
    assert download.content == PDF
