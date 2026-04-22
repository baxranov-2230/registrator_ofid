from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int | None = None
    action: str
    entity_type: str
    entity_id: int | None = None
    old_value: dict | None = None
    new_value: dict | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime
