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

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    base = os.path.basename(name)
    base = _SAFE_NAME.sub("_", base)[:200]
    return base or "file"


async def save_upload(upload: UploadFile, request_id: int, uploader_id: int) -> dict:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await upload.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Max {settings.max_upload_mb} MB")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    mime = upload.content_type or "application/octet-stream"
    if mime not in _ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f"Unsupported type: {mime}")

    req_dir = Path(settings.storage_dir) / str(request_id)
    req_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_filename(upload.filename or "file")
    stored_name = f"{secrets.token_hex(8)}_{safe_name}"
    full_path = req_dir / stored_name
    full_path.write_bytes(content)

    return {
        "file_path": str(full_path),
        "file_name": safe_name,
        "file_size": len(content),
        "mime_type": mime,
    }
