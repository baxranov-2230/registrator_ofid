import asyncio
import logging
from email.message import EmailMessage

import aiosmtplib
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Notification
from app.models.notification import NotificationChannel

log = logging.getLogger(__name__)


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
    return notif


async def send_email(
    to: str,
    subject: str,
    body: str,
    html: str | None = None,
) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username or None,
            password=settings.smtp_password or None,
            use_tls=settings.smtp_tls,
        )
    except Exception as exc:
        log.warning("Email send failed to %s: %s", to, exc)


def enqueue_email(to: str, subject: str, body: str, html: str | None = None) -> None:
    """Fire-and-forget email; errors are logged, not raised."""
    asyncio.create_task(send_email(to, subject, body, html))
