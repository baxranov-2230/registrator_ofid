from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import Settings
from app.core.security import hash_password, verify_password
from app.models.request import RequestStatus
from app.services.file_service import _sniff_mime
from app.services.request_service import _ALLOWED_TRANSITIONS, generate_tracking_no


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("secret123")
    assert hashed != "secret123"
    assert verify_password("secret123", hashed)
    assert not verify_password("wrong", hashed)


def test_state_machine_shape() -> None:
    assert RequestStatus.ACCEPTED in _ALLOWED_TRANSITIONS[RequestStatus.NEW]
    assert RequestStatus.COMPLETED in _ALLOWED_TRANSITIONS[RequestStatus.IN_PROGRESS]
    # Closed states are terminal.
    assert _ALLOWED_TRANSITIONS[RequestStatus.COMPLETED] == set()
    assert _ALLOWED_TRANSITIONS[RequestStatus.REJECTED] == set()


class _StubSession:
    """Returns a preset value for the MAX(tracking_no) reseed query."""

    def __init__(self, highest: str | None) -> None:
        self.highest = highest

    async def execute(self, _stmt):
        highest = self.highest

        class _Result:
            def scalar_one_or_none(self):
                return highest

        return _Result()


async def test_tracking_no_uses_redis_counter(fake_redis) -> None:
    """Happy path: sequential numbers from the counter."""
    db = _StubSession(None)
    year = datetime.now(UTC).year
    first = await generate_tracking_no(db, fake_redis)
    second = await generate_tracking_no(db, fake_redis)
    assert first == f"REQ-{year}-00001"
    assert second == f"REQ-{year}-00002"


async def test_tracking_no_recovers_from_flushed_redis(fake_redis) -> None:
    """D-02: a wiped counter must not restart at 1 and collide."""
    year = datetime.now(UTC).year
    db = _StubSession(f"REQ-{year}-00042")
    assert await generate_tracking_no(db, fake_redis) == f"REQ-{year}-00043"


@pytest.mark.parametrize(
    "declared,content",
    [
        ("application/pdf", b"%PDF-1.7 rest"),
        ("image/png", b"\x89PNG\r\n\x1a\nrest"),
        ("image/jpeg", b"\xff\xd8\xff\xe0rest"),
    ],
)
def test_sniff_accepts_matching_content(declared, content) -> None:
    assert _sniff_mime(content, declared) == declared


def test_sniff_rejects_mislabelled_content() -> None:
    """B-07: an executable renamed to .pdf must not pass on Content-Type alone."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        _sniff_mime(b"MZ\x90\x00executable", "application/pdf")
    assert exc.value.status_code == 415


def test_production_settings_reject_dev_secrets() -> None:
    """B-02/B-03/B-04: the app must refuse to boot insecurely."""
    with pytest.raises(ValueError) as exc:
        Settings(
            env="production",
            jwt_secret="dev-secret-change-me",
            hemis_use_mock=True,
            cors_origins="*",
            database_url="postgresql+asyncpg://royd:royd_dev_pw@db:5432/royd",
        )
    message = str(exc.value)
    assert "JWT_SECRET" in message
    assert "HEMIS_USE_MOCK" in message
    assert "CORS_ORIGINS" in message


def test_production_settings_accept_a_real_configuration() -> None:
    cfg = Settings(
        env="production",
        jwt_secret="x" * 48,
        hemis_use_mock=False,
        cors_origins="https://royd.ndki.uz",
        database_url="postgresql+asyncpg://royd:S3cure-Passw0rd@db:5432/royd",
    )
    assert cfg.is_dev is False
    assert cfg.cors_origins_list == ["https://royd.ndki.uz"]


def test_dev_settings_stay_permissive() -> None:
    """Development must not be blocked by the production guard."""
    cfg = Settings(env="dev", jwt_secret="short", hemis_use_mock=True, cors_origins="*")
    assert cfg.is_dev is True


def test_overdue_flag_reflects_deadline() -> None:
    """C-04: is_overdue is computed, not stored."""
    from app.schemas.request import RequestSummary

    base = dict(
        id=1,
        tracking_no="REQ-2026-00001",
        title="t",
        status=RequestStatus.NEW,
        priority="normal",
        category_id=1,
        student_id=1,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    late = RequestSummary(**base, sla_deadline=datetime.now(UTC) - timedelta(hours=1))
    assert late.is_overdue is True

    on_time = RequestSummary(**base, sla_deadline=datetime.now(UTC) + timedelta(hours=1))
    assert on_time.is_overdue is False

    # A closed request is never "overdue", even past its deadline.
    closed = RequestSummary(
        **{**base, "status": RequestStatus.COMPLETED},
        sla_deadline=datetime.now(UTC) - timedelta(hours=5),
    )
    assert closed.is_overdue is False
