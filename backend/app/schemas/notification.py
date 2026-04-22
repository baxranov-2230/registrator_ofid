from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: str
    title: str
    body: str
    channel: str
    is_read: bool
    payload: dict
    created_at: datetime
    read_at: datetime | None = None
