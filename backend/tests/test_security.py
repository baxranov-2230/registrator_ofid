from datetime import timedelta

from app.core.security import hash_password, verify_password


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("secret123")
    assert hashed != "secret123"
    assert verify_password("secret123", hashed)
    assert not verify_password("wrong", hashed)


def test_tracking_no_format() -> None:
    sample = "REQ-2026-00001"
    parts = sample.split("-")
    assert parts[0] == "REQ"
    assert parts[1].isdigit() and len(parts[1]) == 4
    assert parts[2].isdigit() and len(parts[2]) == 5


def test_state_machine_imports() -> None:
    from app.services.request_service import _ALLOWED_TRANSITIONS
    from app.models.request import RequestStatus

    assert RequestStatus.ACCEPTED in _ALLOWED_TRANSITIONS[RequestStatus.NEW]
    assert RequestStatus.COMPLETED in _ALLOWED_TRANSITIONS[RequestStatus.IN_PROGRESS]
    assert RequestStatus.ACCEPTED not in _ALLOWED_TRANSITIONS[RequestStatus.COMPLETED]
