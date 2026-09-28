from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification
from app.models.notification import NotificationChannel

# Emails and webhooks go through the durable outbox (services/outbox_service).


async def create_notification(
    db: AsyncSession,
    *,
    user_id: int,
    type_: str,
    title: str,
    body: str,
    payload: dict | None = None,
    channel: str = NotificationChannel.IN_APP,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        payload=payload or {},
        channel=channel,
    )
    db.add(notif)
    await db.flush()

    # Push to any live websocket for this user (C-02). Imported lazily because
    # the websocket router imports security, which imports models.
    from app.api.v1.ws import manager

    await manager.push(
        user_id,
        {
            "type": "notification",
            "id": notif.id,
            "notification_type": type_,
            "title": title,
            "body": body,
            "payload": payload or {},
            "created_at": notif.created_at.isoformat() if notif.created_at else None,
        },
    )
    return notif
