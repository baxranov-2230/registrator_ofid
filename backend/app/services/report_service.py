"""KPI reports (Reglament 8-bob).

"Rahbariyat va administrator oylik KPI hisobotini tizimdan yuklab olishi
mumkin. Hisobotlar fakultet, bo'lim, registrator va xodim kesimida taqdim
etiladi."

The metrics are the ones the Reglament names:

* acceptance speed — mean time from filing to first `accepted` (target: 1 day);
* SLA compliance — share of closed requests closed by their deadline
  (target: 90% for staff, 95% for registrators);
* rejection rate — share of closed requests that were rejected (target: <5%);
* rework rate — share of requests that were returned at least once;
* resolution time — mean time from filing to closing.

Aggregation happens in Python over one row per request. A report covers a
month or a semester — thousands of rows at most — and doing it here keeps the
arithmetic identical on PostgreSQL and on the SQLite test database.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.config import settings
from app.models import Department, Faculty, Request, RequestCategory, RequestHistory, User
from app.models.request import RequestStatus

GROUP_BY = ("staff", "faculty", "department", "service_type")

GROUP_TITLES = {
    "staff": "Mas'ul xodim",
    "faculty": "Fakultet",
    "department": "Kafedra / bo'lim",
    "service_type": "Xizmat turi",
}

_UNSET_LABEL = {
    "staff": "Biriktirilmagan",
    "faculty": "Fakultet ko'rsatilmagan",
    "department": "Bo'lim ko'rsatilmagan",
    "service_type": "Turi ko'rsatilmagan",
}


@dataclass
class _Acc:
    total: int = 0
    open: int = 0
    completed: int = 0
    rejected: int = 0
    overdue_open: int = 0
    closed_on_time: int = 0
    returned_once: int = 0
    resolution_hours: list[float] = field(default_factory=list)
    accept_hours: list[float] = field(default_factory=list)

    def add(self, row: dict, now: datetime) -> None:
        self.total += 1
        status = row["status"]
        if status in RequestStatus.OPEN:
            self.open += 1
        if status == RequestStatus.COMPLETED:
            self.completed += 1
        if status == RequestStatus.REJECTED:
            self.rejected += 1
        if status in RequestStatus.SLA_RUNNING and row["sla_deadline"] < now:
            self.overdue_open += 1
        if row["closed_at"] is not None:
            if row["closed_at"] <= row["sla_deadline"]:
                self.closed_on_time += 1
            self.resolution_hours.append(
                (row["closed_at"] - row["created_at"]).total_seconds() / 3600
            )
        if row["first_accepted_at"] is not None:
            self.accept_hours.append(
                (row["first_accepted_at"] - row["created_at"]).total_seconds() / 3600
            )
        if row["was_returned"]:
            self.returned_once += 1

    def as_row(self, key: int | None, label: str) -> dict:
        closed = self.completed + self.rejected

        def pct(part: int, whole: int) -> float | None:
            return round(100 * part / whole, 1) if whole else None

        def mean(values: list[float]) -> float | None:
            return round(sum(values) / len(values), 1) if values else None

        return {
            "key": key,
            "label": label,
            "total": self.total,
            "open": self.open,
            "completed": self.completed,
            "rejected": self.rejected,
            "overdue_open": self.overdue_open,
            "sla_compliance_pct": pct(self.closed_on_time, closed),
            "rejection_pct": pct(self.rejected, closed),
            "returned_pct": pct(self.returned_once, self.total),
            "avg_accept_hours": mean(self.accept_hours),
            "avg_resolution_hours": mean(self.resolution_hours),
        }


def _aware(moment: datetime | None) -> datetime | None:
    if moment is None:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def default_period(today: date | None = None) -> tuple[date, date]:
    """The current month in the university's timezone."""
    today = today or datetime.now(ZoneInfo(settings.sla_timezone)).date()
    start = today.replace(day=1)
    return start, today


def _utc_bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    tz = ZoneInfo(settings.sla_timezone)
    start = datetime.combine(date_from, time.min, tzinfo=tz).astimezone(UTC)
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=tz).astimezone(UTC)
    return start, end


async def _rows(db: AsyncSession, date_from: date, date_to: date) -> list[dict]:
    start, end = _utc_bounds(date_from, date_to)
    # When the request was first taken into work. Under the old triage flow
    # that was the move to `accepted`; requests are now routed straight into
    # `in_progress`, so either counts.
    first_accepted = (
        select(func.min(RequestHistory.created_at))
        .where(
            RequestHistory.request_id == Request.id,
            RequestHistory.new_status.in_((RequestStatus.ACCEPTED, RequestStatus.IN_PROGRESS)),
        )
        .scalar_subquery()
    )
    was_returned = exists().where(
        RequestHistory.request_id == Request.id,
        RequestHistory.new_status == RequestStatus.RETURNED,
    )
    service = aliased(RequestCategory)
    stmt = (
        select(
            Request.status,
            Request.assigned_to,
            Request.faculty_id,
            Request.department_id,
            service.parent_id.label("service_type_id"),
            Request.created_at,
            Request.closed_at,
            Request.sla_deadline,
            first_accepted.label("first_accepted_at"),
            was_returned.label("was_returned"),
        )
        .join(service, service.id == Request.category_id)
        .where(Request.created_at >= start, Request.created_at < end)
    )
    rows = []
    for r in (await db.execute(stmt)).mappings():
        row = dict(r)
        for key in ("created_at", "closed_at", "sla_deadline", "first_accepted_at"):
            row[key] = _aware(row[key])
        rows.append(row)
    return rows


async def _labels(db: AsyncSession, group_by: str, keys: set[int]) -> dict[int, str]:
    if not keys:
        return {}
    if group_by == "staff":
        stmt = select(User.id, User.full_name).where(User.id.in_(keys))
    elif group_by == "faculty":
        stmt = select(Faculty.id, Faculty.name).where(Faculty.id.in_(keys))
    elif group_by == "department":
        stmt = select(Department.id, Department.name).where(Department.id.in_(keys))
    else:
        stmt = select(RequestCategory.id, RequestCategory.name).where(RequestCategory.id.in_(keys))
    return {k: v for k, v in (await db.execute(stmt)).all()}


_KEY_COLUMN = {
    "staff": "assigned_to",
    "faculty": "faculty_id",
    "department": "department_id",
    "service_type": "service_type_id",
}


async def kpi_report(db: AsyncSession, group_by: str, date_from: date, date_to: date) -> dict:
    now = datetime.now(UTC)
    rows = await _rows(db, date_from, date_to)

    column = _KEY_COLUMN[group_by]
    groups: dict[int | None, _Acc] = defaultdict(_Acc)
    totals = _Acc()
    for row in rows:
        groups[row[column]].add(row, now)
        totals.add(row, now)

    labels = await _labels(db, group_by, {k for k in groups if k is not None})
    out = [
        acc.as_row(key, labels.get(key, f"#{key}") if key is not None else _UNSET_LABEL[group_by])
        for key, acc in groups.items()
    ]
    out.sort(key=lambda r: (-r["total"], r["label"]))
    return {
        "group_by": group_by,
        "date_from": date_from,
        "date_to": date_to,
        "rows": out,
        "totals": totals.as_row(None, "Jami"),
    }


_XLSX_COLUMNS = [
    ("total", "Jami murojaat", None),
    ("open", "Ochiq", None),
    ("completed", "Bajarilgan", None),
    ("rejected", "Rad etilgan", None),
    ("overdue_open", "Muddati o'tgan (ochiq)", None),
    ("sla_compliance_pct", "SLA saqlanishi, %", "0.0"),
    ("rejection_pct", "Rad etish, %", "0.0"),
    ("returned_pct", "Qaytarilgan, %", "0.0"),
    ("avg_accept_hours", "O'rtacha qabul qilish, soat", "0.0"),
    ("avg_resolution_hours", "O'rtacha hal qilish, soat", "0.0"),
]


def to_xlsx(report: dict) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "KPI"

    title = (
        f"ROYD KPI hisoboti — {GROUP_TITLES[report['group_by']]} kesimida, "
        f"{report['date_from']:%d.%m.%Y} – {report['date_to']:%d.%m.%Y}"
    )
    ws.append([title])
    ws["A1"].font = Font(bold=True, size=13)
    ws.append([])

    header = [GROUP_TITLES[report["group_by"]], *(h for _, h, _ in _XLSX_COLUMNS)]
    ws.append(header)
    header_row = ws.max_row
    fill = PatternFill("solid", fgColor="E0E7FF")
    for cell in ws[header_row]:
        cell.font = Font(bold=True)
        cell.fill = fill
        cell.alignment = Alignment(wrap_text=True, vertical="center")

    def write(row: dict, bold: bool = False) -> None:
        ws.append([row["label"], *(row[k] for k, _, _ in _XLSX_COLUMNS)])
        for idx, (_, _, fmt) in enumerate(_XLSX_COLUMNS, start=2):
            cell = ws.cell(row=ws.max_row, column=idx)
            if fmt:
                cell.number_format = fmt
            if bold:
                cell.font = Font(bold=True)
        if bold:
            ws.cell(row=ws.max_row, column=1).font = Font(bold=True)

    for row in report["rows"]:
        write(row)
    write(report["totals"], bold=True)

    ws.column_dimensions["A"].width = 45
    for idx in range(2, len(_XLSX_COLUMNS) + 2):
        ws.column_dimensions[get_column_letter(idx)].width = 16
    ws.row_dimensions[header_row].height = 32
    ws.freeze_panes = ws.cell(row=header_row + 1, column=2)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
