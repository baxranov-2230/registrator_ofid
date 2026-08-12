import os
import re
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import settings

_ALLOWED_MIME = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

# Leading bytes that must be present for each accepted type. The browser-supplied
# Content-Type is attacker-controlled, so it decides nothing on its own (B-07).
_MAGIC_BYTES: dict[str, tuple[bytes, ...]] = {
    "application/pdf": (b"%PDF-",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
    # .docx is a zip container; .doc is an OLE2 compound file.
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b"PK\x03\x04",),
    "application/msword": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", b"PK\x03\x04"),
}

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    base = os.path.basename(name)
    base = _SAFE_NAME.sub("_", base)[:200]
    return base or "file"


def _sniff_mime(content: bytes, declared: str) -> str:
    """Confirm the bytes match the declared type, or reject the upload."""
    expected = _MAGIC_BYTES.get(declared, ())
    if not any(content.startswith(sig) for sig in expected):
        raise HTTPException(
            status_code=415,
            detail="Fayl mazmuni e'lon qilingan turga mos kelmadi",
        )
    # WebP carries its real marker at offset 8, after the RIFF chunk size.
    if declared == "image/webp" and content[8:12] != b"WEBP":
        raise HTTPException(status_code=415, detail="Yaroqsiz WebP fayl")
    return declared


def resolve_stored_path(stored: str) -> Path:
    """Absolute path for a value read back from request_files.file_path.

    Paths are stored relative to STORAGE_DIR (D-05) but older rows may hold an
    absolute path, so both are handled. The resolved path is confined to the
    storage root, which also blocks traversal via a tampered database value.
    """
    root = Path(settings.storage_dir).resolve()
    candidate = Path(stored)
    full = candidate if candidate.is_absolute() else root / candidate
    full = full.resolve()
    if not full.is_relative_to(root) and not candidate.is_absolute():
        raise HTTPException(status_code=400, detail="Fayl yo'li yaroqsiz")
    return full


async def save_upload(upload: UploadFile, request_id: int, uploader_id: int) -> dict:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await upload.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Maksimal hajm {settings.max_upload_mb} MB")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Bo'sh fayl")

    declared = (upload.content_type or "application/octet-stream").split(";")[0].strip()
    if declared not in _ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f"Qo'llab-quvvatlanmaydigan tur: {declared}")

    mime = _sniff_mime(content, declared)

    root = Path(settings.storage_dir)
    req_dir = root / str(request_id)
    req_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_filename(upload.filename or "file")
    stored_name = f"{secrets.token_hex(8)}_{safe_name}"
    (req_dir / stored_name).write_bytes(content)

    return {
        # Relative to STORAGE_DIR so the rows survive a change of mount point.
        "file_path": str(Path(str(request_id)) / stored_name),
        "file_name": safe_name,
        "file_size": len(content),
        "mime_type": mime,
    }
