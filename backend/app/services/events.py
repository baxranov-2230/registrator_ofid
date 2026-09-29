"""Request events for the partner platform students apply through.

Students no longer use this web app; they file and follow requests on another
platform that talks to the API. In-app notifications therefore never reach
them. Every change a student must learn about is published here as a webhook
(delivered through the outbox), so the partner can show it on its side.

Event names are part of the integration contract (docs/INTEGRATION.md):

  request.created          a request was filed (already routed: `in_progress`,
                           or `completed` when its service answers itself)
  request.status_changed   status moved; `comment` explains a return, and
                           `answer` carries the final answer on completion
  request.message_created  a message visible to the student was posted
  request.file_added       a file was attached (e.g. the finished document)
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Request, Student
from app.services.labels import status_label
from app.services.outbox_service import enqueue_webhook

REQUEST_CREATED = "request.created"
REQUEST_STATUS_CHANGED = "request.status_changed"
REQUEST_MESSAGE_CREATED = "request.message_created"
REQUEST_FILE_ADDED = "request.file_added"


async def publish(db: AsyncSession, event: str, req: Request, **extra: object) -> None:
    hemis_id = (
        await db.execute(
            select(Student.external_student_id).where(Student.user_id == req.student_id)
        )
    ).scalar_one_or_none()
    data: dict[str, object] = {
        "request_id": req.id,
        "tracking_no": req.tracking_no,
        "client_ref": req.client_ref,
        "student_hemis_id": hemis_id,
        "status": req.status,
        "status_label": status_label(req.status),
        "sla_deadline": req.sla_deadline.isoformat() if req.sla_deadline else None,
    }
    data.update(extra)
    await enqueue_webhook(db, event, data)
