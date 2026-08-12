from pydantic import BaseModel, ConfigDict


class DashboardStats(BaseModel):
    """Role-scoped dashboard counters (C-01)."""

    model_config = ConfigDict(from_attributes=True)

    total: int
    open: int
    by_status: dict[str, int]
    overdue: int
    due_soon: int
    completed_today: int
    created_this_week: int
    avg_resolution_hours: float | None = None
    sla_compliance_pct: float | None = None
    # Admin / leadership only.
    total_users: int | None = None
    unassigned: int | None = None
