"""User-facing Uzbek names for internal codes.

Notifications and emails used to print raw status codes ("new → accepted",
"in_progress"), which mean nothing to a student. These mirror the labels in the
frontend's uz.json so the two never describe the same state differently.
"""

from app.models.request import RequestStatus

STATUS_LABELS: dict[str, str] = {
    RequestStatus.NEW: "Yangi",
    RequestStatus.ACCEPTED: "Qabul qilindi",
    RequestStatus.IN_PROGRESS: "Jarayonda",
    RequestStatus.COMPLETED: "Javob berildi",
    RequestStatus.REJECTED: "Rad etildi",
    RequestStatus.RETURNED: "Qaytarildi",
}


def status_label(code: str | None) -> str:
    if code is None:
        return "—"
    return STATUS_LABELS.get(code, code)
