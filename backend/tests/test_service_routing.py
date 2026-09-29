"""Request types, their service types, and routing chosen per service type."""

from sqlalchemy import select

from app.models import Employee, RequestCategory, Role, User


async def _create(client, headers, body: dict):
    return await client.post("/api/v1/admin/categories", headers=headers, json=body)


async def _service(client, admin, seeded, **fields) -> dict:
    resp = await _create(
        client,
        admin,
        {
            "parent_id": seeded["service_type_id"],
            "name": "Xizmat",
            "sla_hours": 8,
            "priority": "high",
            **fields,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _file(client, headers, category_id: int):
    return await client.post(
        "/api/v1/requests",
        headers=headers,
        json={"category_id": category_id, "title": "Murojaat", "description": "Matn"},
    )


async def _make_general_manager(session_factory, user_id: int) -> None:
    async with session_factory() as db:
        profile = (
            await db.execute(select(Employee).where(Employee.user_id == user_id))
        ).scalar_one()
        profile.is_general_manager = True
        await db.commit()


async def test_request_type_holds_only_name_and_description(client, login):
    admin = await login(Role.ADMIN)
    resp = await _create(
        client, admin, {"name": "Moliyaviy masalalar", "description": "To'lov va kontrakt"}
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["parent_id"] is None
    assert body["description"] == "To'lov va kontrakt"


async def test_service_type_nests_only_under_a_request_type(client, login, seeded):
    admin = await login(Role.ADMIN)
    service = await _service(client, admin, seeded, routing="general_manager")
    assert service["routing"] == "general_manager"
    assert service["sla_hours"] == 8
    assert service["priority"] == "high"

    resp = await _create(client, admin, {"parent_id": service["id"], "name": "Uchinchi daraja"})
    assert resp.status_code == 400

    tree = (await client.get("/api/v1/categories", headers=admin)).json()
    request_type = next(n for n in tree if n["id"] == seeded["service_type_id"])
    assert {c["id"] for c in request_type["children"]} >= {service["id"], seeded["category_id"]}


async def test_retired_request_type_takes_its_services_out_of_the_tree(client, login, seeded):
    admin = await login(Role.ADMIN)
    request_type = (await _create(client, admin, {"name": "Eski tur"})).json()
    service = (
        await _create(client, admin, {"parent_id": request_type["id"], "name": "Eski xizmat"})
    ).json()
    resp = await client.delete(f"/api/v1/admin/categories/{request_type['id']}", headers=admin)
    assert resp.status_code == 204

    tree = (await client.get("/api/v1/categories", headers=admin)).json()
    listed = {n["id"] for n in tree} | {c["id"] for n in tree for c in n["children"]}
    # The service is still active, but it must not surface as a request type.
    assert service["id"] not in listed
    assert all(n["parent_id"] is None for n in tree)


async def test_auto_reply_needs_its_answer(client, login, seeded):
    admin = await login(Role.ADMIN)
    resp = await _create(
        client,
        admin,
        {"parent_id": seeded["service_type_id"], "name": "Avto", "routing": "auto_reply"},
    )
    assert resp.status_code == 422

    service = await _service(client, admin, seeded)
    resp = await client.patch(
        f"/api/v1/admin/categories/{service['id']}",
        headers=admin,
        json={"routing": "auto_reply", "auto_reply_text": "   "},
    )
    assert resp.status_code == 422


async def test_levels_cannot_be_swapped(client, login, seeded):
    admin = await login(Role.ADMIN)
    resp = await client.patch(
        f"/api/v1/admin/categories/{seeded['category_id']}",
        headers=admin,
        json={"parent_id": None},
    )
    assert resp.status_code == 400

    other = (await _create(client, admin, {"name": "Boshqa tur"})).json()
    resp = await client.patch(
        f"/api/v1/admin/categories/{seeded['service_type_id']}",
        headers=admin,
        json={"parent_id": other["id"]},
    )
    assert resp.status_code == 400


async def test_auto_reply_service_answers_and_closes_without_a_manager(client, login, seeded):
    admin = await login(Role.ADMIN)
    service = await _service(
        client, admin, seeded, routing="auto_reply", auto_reply_text="Jadval saytda e'lon qilingan."
    )

    resp = await _file(client, await login(Role.STUDENT), service["id"])
    assert resp.status_code == 201, resp.text
    req = resp.json()
    assert req["status"] == "completed"
    assert req["assigned_to"] is None
    assert req["closed_at"] is not None
    assert req["priority"] == "high"
    assert req["answer"]["text"] == "Jadval saytda e'lon qilingan."
    assert req["answer"]["answered_by"] is None
    assert [h["new_status"] for h in req["history"]] == ["new", "completed"]

    # Nobody's queue shows it.
    staff_queue = (await client.get("/api/v1/requests", headers=await login(Role.STAFF))).json()
    assert staff_queue["total"] == 0


async def test_general_service_goes_to_the_general_manager(client, login, seeded, session_factory):
    admin = await login(Role.ADMIN)
    service = await _service(client, admin, seeded, routing="general_manager")
    registrator_id = seeded["user_ids"][Role.REGISTRATOR]
    await _make_general_manager(session_factory, registrator_id)

    resp = await _file(client, await login(Role.STUDENT), service["id"])
    assert resp.status_code == 201, resp.text
    req = resp.json()
    # The faculty's staff member would have won under faculty routing.
    assert req["assigned_to"] == registrator_id
    assert req["status"] == "in_progress"
    assert req["priority"] == "high"


async def test_general_service_without_a_general_manager_is_refused(client, login, seeded):
    admin = await login(Role.ADMIN)
    service = await _service(client, admin, seeded, routing="general_manager")
    resp = await _file(client, await login(Role.STUDENT), service["id"])
    assert resp.status_code == 409


async def test_general_service_goes_to_its_chosen_employee(client, login, seeded, session_factory):
    admin = await login(Role.ADMIN)
    staff_id = seeded["user_ids"][Role.STAFF]
    service = await _service(client, admin, seeded, routing="general_manager", assignee_id=staff_id)
    assert service["assignee_id"] == staff_id
    # A flagged general manager exists too; the service's own choice wins.
    await _make_general_manager(session_factory, seeded["user_ids"][Role.REGISTRATOR])

    resp = await _file(client, await login(Role.STUDENT), service["id"])
    assert resp.status_code == 201, resp.text
    assert resp.json()["assigned_to"] == staff_id


async def test_chosen_employee_must_be_able_to_take_requests(client, login, seeded):
    admin = await login(Role.ADMIN)
    resp = await _create(
        client,
        admin,
        {
            "parent_id": seeded["service_type_id"],
            "name": "Xizmat",
            "routing": "general_manager",
            "assignee_id": seeded["user_ids"][Role.LEADERSHIP],
        },
    )
    assert resp.status_code == 400

    # Other routes pick their handler themselves.
    resp = await _create(
        client,
        admin,
        {
            "parent_id": seeded["service_type_id"],
            "name": "Xizmat",
            "routing": "faculty_manager",
            "assignee_id": seeded["user_ids"][Role.STAFF],
        },
    )
    assert resp.status_code == 400


async def test_leaving_general_routing_drops_the_chosen_employee(client, login, seeded):
    admin = await login(Role.ADMIN)
    service = await _service(
        client,
        admin,
        seeded,
        routing="general_manager",
        assignee_id=seeded["user_ids"][Role.STAFF],
    )
    resp = await client.patch(
        f"/api/v1/admin/categories/{service['id']}",
        headers=admin,
        json={"routing": "faculty_manager"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["assignee_id"] is None


async def test_deactivated_chosen_employee_falls_back_to_general_managers(
    client, login, seeded, session_factory
):
    admin = await login(Role.ADMIN)
    staff_id = seeded["user_ids"][Role.STAFF]
    service = await _service(client, admin, seeded, routing="general_manager", assignee_id=staff_id)
    student = await login(Role.STUDENT)
    async with session_factory() as db:
        (await db.get(User, staff_id)).is_active = False
        await db.commit()

    resp = await _file(client, student, service["id"])
    assert resp.status_code == 409

    registrator_id = seeded["user_ids"][Role.REGISTRATOR]
    await _make_general_manager(session_factory, registrator_id)
    resp = await _file(client, student, service["id"])
    assert resp.status_code == 201, resp.text
    assert resp.json()["assigned_to"] == registrator_id


async def test_faculty_service_keeps_faculty_routing(client, login, seeded, session_factory):
    await _make_general_manager(session_factory, seeded["user_ids"][Role.REGISTRATOR])
    resp = await _file(client, await login(Role.STUDENT), seeded["category_id"])
    assert resp.status_code == 201, resp.text
    assert resp.json()["assigned_to"] == seeded["user_ids"][Role.STAFF]


async def test_admin_flags_a_general_manager(client, login, seeded, session_factory):
    admin = await login(Role.ADMIN)
    staff_id = seeded["user_ids"][Role.STAFF]
    resp = await client.patch(
        f"/api/v1/users/{staff_id}", headers=admin, json={"is_general_manager": True}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_general_manager"] is True

    resp = await client.patch(
        f"/api/v1/users/{seeded['user_ids'][Role.LEADERSHIP]}",
        headers=admin,
        json={"is_general_manager": True},
    )
    assert resp.status_code == 400

    async with session_factory() as db:
        user = await db.get(User, staff_id)
        assert user.is_general_manager is True


async def test_services_default_to_faculty_routing(session_factory, seeded):
    async with session_factory() as db:
        service = await db.get(RequestCategory, seeded["category_id"])
        assert service.routing == "faculty_manager"
