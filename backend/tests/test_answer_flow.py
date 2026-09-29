"""Direct routing to a handler, and closing a request only through an answer."""

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.models import Employee, Role, User


async def _file(client, headers, seeded) -> dict:
    resp = await client.post(
        "/api/v1/requests",
        headers=headers,
        json={"category_id": seeded["category_id"], "title": "Murojaat", "description": "Matn"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _add_staff(session_factory, seeded, *, department_id: int | None) -> int:
    async with session_factory() as db:
        role = (await db.execute(select(Role).where(Role.name == Role.STAFF))).scalar_one()
        user = User(
            full_name="Bo'lim xodimi",
            email="staff2@test.uz",
            password_hash=hash_password("parol12345"),
            role_id=role.id,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        db.add(
            Employee(user_id=user.id, faculty_id=seeded["faculty_id"], department_id=department_id)
        )
        await db.commit()
        return user.id


async def test_staff_from_the_students_department_is_preferred(
    client, login, seeded, session_factory
):
    dept_staff = await _add_staff(session_factory, seeded, department_id=seeded["department_id"])
    req = await _file(client, await login(Role.STUDENT), seeded)
    assert req["assigned_to"] == dept_staff


async def test_falls_back_to_the_faculty_registrator_without_staff(
    client, login, seeded, session_factory
):
    async with session_factory() as db:
        staff = await db.get(User, seeded["user_ids"][Role.STAFF])
        staff.is_active = False
        await db.commit()

    req = await _file(client, await login(Role.STUDENT), seeded)
    assert req["assigned_to"] == seeded["user_ids"][Role.REGISTRATOR]
    assert req["status"] == "in_progress"


async def test_accept_complete_and_reject_are_not_outcomes(client, login, seeded):
    staff = await login(Role.STAFF)
    req = await _file(client, await login(Role.STUDENT), seeded)
    for target in ("accepted", "completed", "rejected"):
        resp = await client.post(
            f"/api/v1/requests/{req['id']}/transition",
            headers=staff,
            json={"status": target, "comment": "Sabab"},
        )
        assert resp.status_code == 400, (target, resp.text)


async def test_staff_can_return_their_own_request(client, login, seeded):
    staff = await login(Role.STAFF)
    req = await _file(client, await login(Role.STUDENT), seeded)
    resp = await client.post(
        f"/api/v1/requests/{req['id']}/transition",
        headers=staff,
        json={"status": "returned", "comment": "Pasport nusxasi kerak"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "returned"


async def test_answer_needs_text(client, login, seeded):
    staff = await login(Role.STAFF)
    req = await _file(client, await login(Role.STUDENT), seeded)
    resp = await client.post(
        f"/api/v1/requests/{req['id']}/answer", headers=staff, data={"text": ""}
    )
    assert resp.status_code == 422


async def test_only_the_handler_or_triage_may_answer(client, login, seeded):
    student = await login(Role.STUDENT)
    staff = await login(Role.STAFF)
    registrator = await login(Role.REGISTRATOR)
    req = await _file(client, student, seeded)

    for headers in (student, await login(Role.LEADERSHIP)):
        resp = await client.post(
            f"/api/v1/requests/{req['id']}/answer", headers=headers, data={"text": "Javob"}
        )
        assert resp.status_code == 403

    await client.post(
        f"/api/v1/requests/{req['id']}/assign",
        headers=registrator,
        json={"assignee_id": seeded["user_ids"][Role.REGISTRATOR]},
    )
    resp = await client.post(
        f"/api/v1/requests/{req['id']}/answer", headers=staff, data={"text": "Javob"}
    )
    assert resp.status_code == 403


async def test_answered_request_cannot_be_answered_again(client, login, seeded):
    staff = await login(Role.STAFF)
    req = await _file(client, await login(Role.STUDENT), seeded)
    url = f"/api/v1/requests/{req['id']}/answer"
    assert (await client.post(url, headers=staff, data={"text": "Javob"})).status_code == 200
    assert (await client.post(url, headers=staff, data={"text": "Yana"})).status_code == 409


async def test_answer_files_are_kept_apart_from_conversation_files(
    client, login, seeded, monkeypatch, tmp_path
):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    student = await login(Role.STUDENT)
    staff = await login(Role.STAFF)
    req = await _file(client, student, seeded)

    upload = await client.post(
        f"/api/v1/requests/{req['id']}/files",
        headers=student,
        files={"upload": ("ariza.pdf", b"%PDF-1.4 a", "application/pdf")},
    )
    assert upload.status_code == 201
    assert upload.json()["is_answer"] is False

    resp = await client.post(
        f"/api/v1/requests/{req['id']}/answer",
        headers=staff,
        data={"text": "Tayyor"},
        files=[("files", ("javob.pdf", b"%PDF-1.4 b", "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["files"]) == 2
    assert [f["file_name"] for f in body["answer"]["files"]] == ["javob.pdf"]
