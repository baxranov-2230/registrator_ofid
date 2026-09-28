from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import require_roles
from app.models import Role
from app.schemas.report import KpiReport
from app.services.report_service import default_period, kpi_report, to_xlsx

router = APIRouter(
    prefix="/reports",
    tags=["reports"],
    # Reglament 8.3: leadership and administrators.
    dependencies=[Depends(require_roles(Role.ADMIN, Role.LEADERSHIP))],
)

GroupBy = Literal["staff", "faculty", "department", "service_type"]

#: A year of requests is still a small aggregation; more is a mistake.
_MAX_PERIOD_DAYS = 400


def _period(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    default_from, default_to = default_period()
    start = date_from or default_from
    end = date_to or default_to
    if end < start:
        raise HTTPException(
            status_code=422, detail="Davr oxiri boshidan oldin bo'lishi mumkin emas"
        )
    if (end - start).days > _MAX_PERIOD_DAYS:
        raise HTTPException(status_code=422, detail="Davr 400 kundan oshmasligi kerak")
    return start, end


@router.get("/kpi", response_model=KpiReport)
async def get_kpi(
    group_by: GroupBy = "staff",
    date_from: date | None = Query(default=None, description="Default: first day of this month"),
    date_to: date | None = Query(default=None, description="Default: today"),
    db: AsyncSession = Depends(get_db),
) -> KpiReport:
    start, end = _period(date_from, date_to)
    return KpiReport.model_validate(await kpi_report(db, group_by, start, end))


@router.get("/kpi.xlsx")
async def download_kpi(
    group_by: GroupBy = "staff",
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
) -> Response:
    start, end = _period(date_from, date_to)
    report = await kpi_report(db, group_by, start, end)
    filename = f"royd-kpi-{group_by}-{start:%Y%m%d}-{end:%Y%m%d}.xlsx"
    return Response(
        content=to_xlsx(report),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
