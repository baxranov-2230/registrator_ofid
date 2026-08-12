from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import User
from app.schemas.stats import DashboardStats
from app.services.stats_service import dashboard_stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardStats:
    """Counters for the caller's dashboard, scoped to what their role may see."""
    return DashboardStats.model_validate(await dashboard_stats(db, user))
