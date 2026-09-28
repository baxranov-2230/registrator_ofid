"""Durable delivery of emails and partner webhooks (see models/outbox.py).

Producers call `enqueue_email` / `enqueue_webhook` inside their own
transaction; nothing leaves the process until that transaction commits. The
periodic `deliver_pending` job then sends each row, retrying with exponential
backoff and giving up after `outbox_max_attempts`.
"""

import hashlib
import hmac
import json
import logging
import secrets
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

import aiosmtplib
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.locks import claim
from app.models.outbox import OutboxKind, OutboxMessage, OutboxStatus

log = logging.getLogger(__name__)

_BATCH = 50


async def enqueue_email(
    db: AsyncSession, to: str, subject: str, body: str, html: str | None = None
) -> None:
    db.add(
        OutboxMessage(
            kind=OutboxKind.EMAIL,
            payload={"to": to, "subject": subject, "body": body, "html": html},
        )
    )
    await db.flush()


async def enqueue_webhook(db: AsyncSession, event: str, data: dict) -> None:
    """Queue an event for the partner platform. No-op when webhooks are off."""
    if not settings.webhook_url:
        return
    envelope = {
        "id": secrets.token_hex(12),
        "event": event,
        "occurred_at": datetime.now(UTC).isoformat(),
        "data": data,
    }
    db.add(OutboxMessage(kind=OutboxKind.WEBHOOK, payload=envelope))
    await db.flush()


def sign(body: bytes, secret: str) -> str:
    """Signature the receiver recomputes to prove a delivery came from us."""
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def _send_email(payload: dict) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = payload["to"]
    msg["Subject"] = payload["subject"]
    msg.set_content(payload["body"])
    if payload.get("html"):
        msg.add_alternative(payload["html"], subtype="html")
    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username or None,
        password=settings.smtp_password or None,
        use_tls=settings.smtp_tls,
        timeout=15,
    )


async def _send_webhook(payload: dict) -> None:
    if not settings.webhook_url:
        # Webhooks were switched off after this row was queued.
        return
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    headers = {
        "Content-Type": "application/json",
        "X-ROYD-Event": payload["event"],
        "X-ROYD-Delivery": payload["id"],
        "X-ROYD-Signature": sign(body, settings.webhook_secret),
    }
    async with httpx.AsyncClient(timeout=settings.webhook_timeout_seconds) as client:
        resp = await client.post(settings.webhook_url, content=body, headers=headers)
    if resp.status_code >= 300:
        raise RuntimeError(f"webhook HTTP {resp.status_code}: {resp.text[:200]}")


_SENDERS = {OutboxKind.EMAIL: _send_email, OutboxKind.WEBHOOK: _send_webhook}


async def _deliver_one(row: OutboxMessage) -> None:
    now = datetime.now(UTC)
    sender = _SENDERS.get(row.kind)
    try:
        if sender is None:
            raise RuntimeError(f"unknown outbox kind {row.kind!r}")
        await sender(row.payload)
    except Exception as exc:
        row.attempts += 1
        row.last_error = f"{type(exc).__name__}: {exc}"[:2000]
        if row.attempts >= settings.outbox_max_attempts:
            row.status = OutboxStatus.FAILED
            log.error("Outbox %s #%d failed permanently: %s", row.kind, row.id, row.last_error)
        else:
            row.next_attempt_at = now + timedelta(minutes=2 ** (row.attempts - 1))
            log.warning("Outbox %s #%d attempt %d failed: %s", row.kind, row.id, row.attempts, exc)
        return
    row.attempts += 1
    row.status = OutboxStatus.SENT
    row.sent_at = now
    row.last_error = None


async def deliver_pending(*, use_lock: bool = True) -> int:
    """Send what is due. Returns the number of rows processed."""
    if use_lock and not await claim("outbox", settings.outbox_interval_seconds - 2):
        return 0

    async with SessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(OutboxMessage)
                    .where(
                        OutboxMessage.status == OutboxStatus.PENDING,
                        OutboxMessage.next_attempt_at <= datetime.now(UTC),
                    )
                    .order_by(OutboxMessage.id)
                    .limit(_BATCH)
                    # A second worker that slips past the lock still cannot
                    # pick up a row that is mid-delivery.
                    .with_for_update(skip_locked=True)
                )
            )
            .scalars()
            .all()
        )
        for row in rows:
            await _deliver_one(row)
        await db.commit()
    return len(rows)
