"""API clients: admin management, the token endpoint, and the integration API."""

import base64

import pytest

from app.models.role import Role

ALL_SCOPES = ["requests:read", "requests:write", "catalogs:read"]


def _request_body(seeded, **overrides) -> dict:
    """What the LMS sends: the student's fields beside the request's own."""
    return {
        "student_hemis_id": "3052211100123",
        "full_name": "Integratsiya Talabasi",
        "image": "https://lms.test/photos/3052211100123.jpg",
        "faculty": "Axborot texnologiyalari",
        "group": "IT-21",
        "category_id": seeded["category_id"],
        "title": "Ma'lumotnoma kerak",
        "description": "O'qish joyidan ma'lumotnoma",
        **overrides,
    }


@pytest.fixture
def make_client(client, login):
    async def _make(name: str = "Talabalar platformasi", scopes: list[str] | None = None) -> dict:
        admin = await login(Role.ADMIN)
        resp = await client.post(
            "/api/v1/admin/api-clients",
            headers=admin,
            json={"name": name, "scopes": scopes or ALL_SCOPES},
        )
        assert resp.status_code == 201, resp.text
        return resp.json()

    return _make


@pytest.fixture
def client_token(client):
    async def _token(creds: dict, scope: str | None = None) -> dict[str, str]:
        form = {
            "grant_type": "client_credentials",
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
        }
        if scope:
            form["scope"] = scope
        resp = await client.post("/api/v1/oauth/token", data=form)
        assert resp.status_code == 200, resp.text
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    return _token


# ── Admin management ────────────────────────────────────────────────────────


async def test_secret_is_shown_once(client, login, make_client):
    creds = await make_client()
    assert creds["client_id"].startswith("royd_")
    assert len(creds["client_secret"]) >= 40

    listed = await client.get("/api/v1/admin/api-clients", headers=await login(Role.ADMIN))
    assert listed.status_code == 200
    [row] = listed.json()
    assert row["client_id"] == creds["client_id"]
    assert "client_secret" not in row
    assert "secret_hash" not in row


async def test_only_admin_manages_clients(client, login):
    for role in (Role.REGISTRATOR, Role.LEADERSHIP, Role.STAFF):
        headers = await login(role)
        resp = await client.post(
            "/api/v1/admin/api-clients", headers=headers, json={"name": "x", "scopes": ALL_SCOPES}
        )
        assert resp.status_code == 403, role


async def test_unknown_scope_rejected(client, login):
    resp = await client.post(
        "/api/v1/admin/api-clients",
        headers=await login(Role.ADMIN),
        json={"name": "Boshqa", "scopes": ["requests:delete"]},
    )
    assert resp.status_code == 422


async def test_duplicate_name_is_409(client, login, make_client):
    await make_client("Bir xil nom")
    resp = await client.post(
        "/api/v1/admin/api-clients",
        headers=await login(Role.ADMIN),
        json={"name": "Bir xil nom", "scopes": ALL_SCOPES},
    )
    assert resp.status_code == 409


# ── Token endpoint ──────────────────────────────────────────────────────────


async def test_token_via_form_and_basic(client, make_client):
    creds = await make_client()

    form = await client.post(
        "/api/v1/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
        },
    )
    assert form.status_code == 200, form.text
    body = form.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert set(body["scope"].split()) == set(ALL_SCOPES)
    assert form.headers["cache-control"] == "no-store"

    basic = base64.b64encode(f"{creds['client_id']}:{creds['client_secret']}".encode()).decode()
    via_basic = await client.post(
        "/api/v1/oauth/token",
        headers={"Authorization": f"Basic {basic}"},
        data={"grant_type": "client_credentials"},
    )
    assert via_basic.status_code == 200, via_basic.text


async def test_token_errors_follow_rfc6749(client, make_client):
    creds = await make_client(scopes=["catalogs:read"])

    wrong = await client.post(
        "/api/v1/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": creds["client_id"],
            "client_secret": "not-the-secret",
        },
    )
    assert wrong.status_code == 401
    assert wrong.json()["error"] == "invalid_client"

    grant = await client.post(
        "/api/v1/oauth/token",
        data={"grant_type": "password", **{k: creds[k] for k in ("client_id", "client_secret")}},
    )
    assert grant.status_code == 400
    assert grant.json()["error"] == "unsupported_grant_type"

    scope = await client.post(
        "/api/v1/oauth/token",
        data={
            "grant_type": "client_credentials",
            "scope": "requests:write",
            **{k: creds[k] for k in ("client_id", "client_secret")},
        },
    )
    assert scope.status_code == 400
    assert scope.json()["error"] == "invalid_scope"


async def test_tokens_do_not_cross_over(client, login, make_client, client_token):
    """A client token is not a user token, and a user token is not a client token."""
    headers = await client_token(await make_client())
    assert (await client.get("/api/v1/requests", headers=headers)).status_code == 401

    user = await login(Role.ADMIN)
    assert (await client.get("/api/v1/integration/requests", headers=user)).status_code == 401


async def test_rotation_and_deactivation_revoke_tokens(client, login, make_client, client_token):
    admin = await login(Role.ADMIN)
    creds = await make_client()
    old_token = await client_token(creds)

    rotated = await client.post(
        f"/api/v1/admin/api-clients/{creds['id']}/rotate-secret", headers=admin
    )
    assert rotated.status_code == 200
    new_secret = rotated.json()["client_secret"]
    assert new_secret != creds["client_secret"]

    assert (
        await client.get("/api/v1/integration/categories", headers=old_token)
    ).status_code == 401
    new_token = await client_token({**creds, "client_secret": new_secret})
    assert (
        await client.get("/api/v1/integration/categories", headers=new_token)
    ).status_code == 200

    off = await client.patch(
        f"/api/v1/admin/api-clients/{creds['id']}", headers=admin, json={"is_active": False}
    )
    assert off.status_code == 200
    assert (
        await client.get("/api/v1/integration/categories", headers=new_token)
    ).status_code == 401
    refused = await client.post(
        "/api/v1/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": creds["client_id"],
            "client_secret": new_secret,
        },
    )
    assert refused.status_code == 401


async def test_scopes_are_enforced(client, login, seeded, make_client, client_token):
    creds = await make_client(scopes=["catalogs:read"])
    headers = await client_token(creds)

    assert (await client.get("/api/v1/integration/categories", headers=headers)).status_code == 200
    resp = await client.post(
        "/api/v1/integration/requests", headers=headers, json=_request_body(seeded)
    )
    assert resp.status_code == 403
    assert (await client.get("/api/v1/integration/requests", headers=headers)).status_code == 403

    # Taking a scope away applies to tokens already issued.
    full = await make_client("To'liq", scopes=ALL_SCOPES)
    full_headers = await client_token(full)
    await client.patch(
        f"/api/v1/admin/api-clients/{full['id']}",
        headers=await login(Role.ADMIN),
        json={"scopes": ["catalogs:read"]},
    )
    assert (
        await client.get("/api/v1/integration/requests", headers=full_headers)
    ).status_code == 403


# ── Integration API ─────────────────────────────────────────────────────────


async def test_client_files_request_for_new_student(
    client, login, seeded, make_client, client_token
):
    headers = await client_token(await make_client())
    resp = await client.post(
        "/api/v1/integration/requests",
        headers={**headers, "Idempotency-Key": "ext-1"},
        json=_request_body(seeded),
    )
    assert resp.status_code == 201, resp.text
    req = resp.json()
    # Routed through the supplied faculty to the registrator bound to it.
    assert req["assigned_to"] == seeded["user_ids"][Role.REGISTRATOR]
    assert req["faculty_id"] == seeded["faculty_id"]
    assert req["student"]["full_name"] == "Integratsiya Talabasi"

    # The student now exists, with the photo and group the LMS sent.
    students = await client.get(
        "/api/v1/users",
        headers=await login(Role.ADMIN),
        params={"role": "student", "search": "3052211100123"},
    )
    [student] = students.json()["items"]
    assert student["external_student_id"] == "3052211100123"
    assert student["image_path"] == "https://lms.test/photos/3052211100123.jpg"
    assert student["group_name"] == "IT-21"
    assert student["faculty_id"] == seeded["faculty_id"]

    again = await client.post(
        "/api/v1/integration/requests",
        headers={**headers, "Idempotency-Key": "ext-1"},
        json=_request_body(seeded),
    )
    assert again.status_code == 200
    assert again.json()["id"] == req["id"]


async def test_existing_student_is_updated_from_client_data(
    client, seeded, make_client, client_token
):
    headers = await client_token(await make_client())
    resp = await client.post(
        "/api/v1/integration/requests",
        headers=headers,
        json=_request_body(seeded, student_hemis_id="STU-TEST-1", full_name="Yangilangan Ism"),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["student_id"] == seeded["user_ids"][Role.STUDENT]
    assert resp.json()["student"]["full_name"] == "Yangilangan Ism"


async def test_unrouted_faculty_is_409(client, seeded, make_client, client_token):
    headers = await client_token(await make_client())
    resp = await client.post(
        "/api/v1/integration/requests",
        headers=headers,
        json=_request_body(seeded, faculty="Registratorsiz fakultet"),
    )
    assert resp.status_code == 409


async def test_client_sees_only_its_own_requests(client, login, seeded, make_client, client_token):
    first = await client_token(await make_client("Birinchi"))
    second = await client_token(await make_client("Ikkinchi"))

    created = await client.post(
        "/api/v1/integration/requests", headers=first, json=_request_body(seeded)
    )
    req_id = created.json()["id"]

    # A request the student filed directly is not the client's either.
    student = await login(Role.STUDENT)
    direct = await client.post(
        "/api/v1/requests",
        headers=student,
        json={"category_id": seeded["category_id"], "title": "To'g'ridan", "description": "abc"},
    )
    assert direct.status_code == 201

    mine = (await client.get("/api/v1/integration/requests", headers=first)).json()
    assert [r["id"] for r in mine["items"]] == [req_id]
    assert (await client.get("/api/v1/integration/requests", headers=second)).json()["total"] == 0

    assert (
        await client.get(f"/api/v1/integration/requests/{req_id}", headers=second)
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/integration/requests/{direct.json()['id']}", headers=first)
    ).status_code == 404

    by_student = await client.get(
        "/api/v1/integration/requests",
        headers=first,
        params={"student_hemis_id": "someone-else"},
    )
    assert by_student.json()["total"] == 0


async def test_idempotency_key_of_another_client_is_409(client, seeded, make_client, client_token):
    first = await client_token(await make_client("Birinchi"))
    second = await client_token(await make_client("Ikkinchi"))
    body = _request_body(seeded)

    ok = await client.post(
        "/api/v1/integration/requests", headers={**first, "Idempotency-Key": "k"}, json=body
    )
    assert ok.status_code == 201
    clash = await client.post(
        "/api/v1/integration/requests", headers={**second, "Idempotency-Key": "k"}, json=body
    )
    assert clash.status_code == 409


async def test_message_return_and_resubmit_as_student(
    client, login, seeded, make_client, client_token
):
    headers = await client_token(await make_client())
    req = (
        await client.post(
            "/api/v1/integration/requests", headers=headers, json=_request_body(seeded)
        )
    ).json()

    registrator = await login(Role.REGISTRATOR)
    note = await client.post(
        f"/api/v1/requests/{req['id']}/messages",
        headers=registrator,
        json={"content": "Faqat xodimlar uchun", "is_internal": True},
    )
    assert note.status_code == 201

    msg = await client.post(
        f"/api/v1/integration/requests/{req['id']}/messages",
        headers=headers,
        json={"content": "Salom, qachon tayyor bo'ladi?"},
    )
    assert msg.status_code == 201, msg.text
    assert msg.json()["sender_id"] == req["student_id"]
    assert msg.json()["is_internal"] is False

    detail = (await client.get(f"/api/v1/integration/requests/{req['id']}", headers=headers)).json()
    assert [m["content"] for m in detail["messages"]] == ["Salom, qachon tayyor bo'ladi?"]

    returned = await client.post(
        f"/api/v1/requests/{req['id']}/transition",
        headers=registrator,
        json={"status": "returned", "comment": "Pasport nusxasini yuklang"},
    )
    assert returned.status_code == 200, returned.text

    resubmitted = await client.post(
        f"/api/v1/integration/requests/{req['id']}/resubmit",
        headers=headers,
        json={"comment": "Yukladim"},
    )
    assert resubmitted.status_code == 200, resubmitted.text
    assert resubmitted.json()["status"] == "new"


async def test_file_upload_and_download(
    client, seeded, make_client, client_token, monkeypatch, tmp_path
):
    from app.core.config import settings

    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    headers = await client_token(await make_client())
    req = (
        await client.post(
            "/api/v1/integration/requests", headers=headers, json=_request_body(seeded)
        )
    ).json()

    upload = await client.post(
        f"/api/v1/integration/requests/{req['id']}/files",
        headers=headers,
        files={"upload": ("pasport.pdf", b"%PDF-1.4 test", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["uploaded_by"] == req["student_id"]

    download = await client.get(
        f"/api/v1/integration/requests/{req['id']}/files/{upload.json()['id']}", headers=headers
    )
    assert download.status_code == 200
    assert download.content == b"%PDF-1.4 test"


@pytest.mark.parametrize(
    "missing", ["student_hemis_id", "full_name", "faculty", "group", "category_id", "title"]
)
async def test_required_fields(client, seeded, make_client, client_token, missing):
    headers = await client_token(await make_client())
    body = _request_body(seeded)
    del body[missing]
    resp = await client.post("/api/v1/integration/requests", headers=headers, json=body)
    assert resp.status_code == 422


async def test_image_is_optional_and_must_be_http(client, seeded, make_client, client_token):
    headers = await client_token(await make_client())
    no_image = _request_body(seeded)
    del no_image["image"]
    assert (
        await client.post("/api/v1/integration/requests", headers=headers, json=no_image)
    ).status_code == 201

    bad = await client.post(
        "/api/v1/integration/requests",
        headers=headers,
        json=_request_body(seeded, image="javascript:alert(1)"),
    )
    assert bad.status_code == 422
