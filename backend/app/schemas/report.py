from datetime import date

from pydantic import BaseModel


class KpiRow(BaseModel):
    #: Id of the staff member / faculty / department / service type; None for
    #: requests without one, and for the totals row.
    key: int | None = None
    label: str
    total: int
    open: int
    completed: int
    rejected: int
    overdue_open: int
    sla_compliance_pct: float | None = None
    rejection_pct: float | None = None
    returned_pct: float | None = None
    avg_accept_hours: float | None = None
    avg_resolution_hours: float | None = None


class KpiReport(BaseModel):
    group_by: str
    date_from: date
    date_to: date
    rows: list[KpiRow]
    totals: KpiRow
