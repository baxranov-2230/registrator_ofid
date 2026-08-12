import asyncio
import logging
from email.message import EmailMessage

import aiosmtplib
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Notification
from app.models.notification import NotificationChannel

log = logging.getLogger(__name__)

# Strong references to in-flight email tasks. asyncio only keeps a weak
# reference to a running task, so without this the garbage collector can
# cancel a send mid-flight (RUF006 / C-07).
_pending_tasks: set[asyncio.Task] = set()


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


async def send_email(to: str, subject: str, body: str, html: str | None = None) -> None:
    """Send one email, retrying transient SMTP failures with backoff."""
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")

    last_error: Exception | None = None
    for attempt in range(1, settings.email_max_retries + 1):
        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_username or None,
                password=settings.smtp_password or None,
                use_tls=settings.smtp_tls,
                timeout=15,
            )
            if attempt > 1:
                log.info("Email to %s delivered on attempt %d", to, attempt)
            return
        except Exception as exc:
            last_error = exc
            if attempt < settings.email_max_retries:
                await asyncio.sleep(2**attempt)

    # Deliberately swallowed: a failed courtesy email must not fail the request
    # that triggered it. The in-app notification row is the durable record.
    log.error(
        "Email to %s failed after %d attempts: %s", to, settings.email_max_retries, last_error
    )


def enqueue_email(to: str, subject: str, body: str, html: str | None = None) -> None:
    """Fire-and-forget email that survives garbage collection."""
    task = asyncio.create_task(send_email(to, subject, body, html))
    _pending_tasks.add(task)
    task.add_done_callback(_pending_tasks.discard)


async def drain_pending_emails(timeout: float = 10.0) -> None:
    """Let in-flight sends finish during shutdown instead of cancelling them."""
    if not _pending_tasks:
        return
    log.info("Waiting for %d pending email task(s)", len(_pending_tasks))
    await asyncio.wait(set(_pending_tasks), timeout=timeout)
