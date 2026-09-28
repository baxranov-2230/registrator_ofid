"""KPI reports (Reglament 8-bob)."""

from io import BytesIO

import pytest
from openpyxl import load_workbook

from app.models.role import Role


async def _file_and_complete(client, login, seeded) -> None:
    student = await login(Role.STUDENT)
    registrator = await login(Role.REGISTRATOR)
    req = (
        await client.post(
            "/api/v1/requests",
            headers=student,
            json={"category_id": seeded["category_id"], "title": "KPI", "description": "Matn"},
        )
    ).json()
    for status in ("accepted", "in_progress", "completed"):
        resp = await client.post(
            f"/api/v1/requests/{req['id']}/transition",
            headers=registrator,
            json={"status": status},
        )
        assert resp.status_code == 200, resp.text


@pytest.mark.parametrize("group_by", ["staff", "faculty", "department", "service_type"])
async def test_kpi_report_groups(client, login, seeded, group_by):
    await _file_and_complete(client, login, seeded)
    leadership = await login(Role.LEADERSHIP)
    resp = await client.get(
        "/api/v1/reports/kpi", headers=leadership, params={"group_by": group_by}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["totals"]["total"] == 1
    assert body["totals"]["completed"] == 1
    assert body["totals"]["sla_compliance_pct"] == 100.0
    assert body["totals"]["avg_accept_hours"] is not None
    assert len(body["rows"]) == 1


async def test_kpi_excel_export(client, login, seeded):
    await _file_and_complete(client, login, seeded)
    admin = await login(Role.ADMIN)
    resp = await client.get("/api/v1/reports/kpi.xlsx", headers=admin)
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]
    sheet = load_workbook(BytesIO(resp.content)).active
    values = [c.value for c in sheet["A"] if c.value]
    assert "Jami" in values


@pytest.mark.parametrize("role", [Role.STAFF, Role.REGISTRATOR, Role.STUDENT])
async def test_kpi_is_for_leadership_and_admin_only(client, login, role):
    headers = await login(role)
    assert (await client.get("/api/v1/reports/kpi", headers=headers)).status_code == 403


async def test_inverted_period_is_rejected(client, login):
    admin = await login(Role.ADMIN)
    resp = await client.get(
        "/api/v1/reports/kpi",
        headers=admin,
        params={"date_from": "2026-09-10", "date_to": "2026-09-01"},
    )
    assert resp.status_code == 422
