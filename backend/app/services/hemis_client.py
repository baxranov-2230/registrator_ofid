import httpx

from app.core.config import settings
from app.services.hemis_mock import HEMIS_MOCK_USERS


class HemisError(Exception):
    pass


class HemisAuthError(HemisError):
    pass


async def hemis_login(username: str, password: str) -> dict:
    """Authenticate student against HEMIS. Returns normalized profile dict.

    Two-step real flow:
      1. POST /auth/login → get Bearer token
      2. GET  /account/me with token → get full student profile
    """
    if settings.hemis_use_mock:
        return _mock_login(username, password)
    return await _real_login(username, password)


async def hemis_fetch_me(hemis_token: str) -> dict:
    """Fetch student profile using an already-obtained HEMIS token.

    Used when the frontend authenticates directly against HEMIS and passes the
    resulting token to the backend for user sync.
    """
    base = settings.hemis_base_url.rstrip("/")
    me_url = f"{base}{settings.hemis_me_path}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                me_url, headers={"Authorization": f"Bearer {hemis_token}"}
            )
        except httpx.HTTPError as exc:
            raise HemisError(f"HEMIS /me xatosi: {exc}") from exc

        try:
            payload = resp.json()
        except ValueError:
            raise HemisError(f"HEMIS /me noto'g'ri javob: {resp.status_code}")

    if resp.status_code == 401 or payload.get("success") is False:
        err = payload.get("error") if isinstance(payload, dict) else None
        raise HemisAuthError(err or "HEMIS token yaroqsiz")
    if resp.status_code >= 400:
        raise HemisError(f"HEMIS /me xatoligi: {resp.status_code}")

    data = payload.get("data") or {}
    return _normalize_profile(data)


def _name(value) -> str | None:
    """HEMIS returns many fields as {'code': '...', 'name': '...'}; return name."""
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get("name") or value.get("code")
    return str(value) if not isinstance(value, str) else value


def _code_int(value) -> int | None:
    """Extract integer code from HEMIS nested dict or scalar."""
    raw = value.get("code") if isinstance(value, dict) else value
    if raw is None:
        return None
    try:
        return int(str(raw).strip().split("-")[0])
    except (ValueError, AttributeError):
        return None


def _hemis_ref(value) -> dict | None:
    """HEMIS nested object → {hemis_id, code, name} dict, or None."""
    if not isinstance(value, dict):
        if value is None:
            return None
        return {"hemis_id": None, "code": None, "name": str(value)}
    hid = value.get("id")
    return {
        "hemis_id": str(hid) if hid is not None else None,
        "code": value.get("code"),
        "name": value.get("name"),
    }


def _normalize_profile(data: dict) -> dict:
    semester_obj = data.get("semester") if isinstance(data.get("semester"), dict) else None
    edu_year = (
        _name(semester_obj.get("education_year")) if semester_obj else None
    )
    return {
        "student_id_number": data.get("student_id_number"),
        "full_name": data.get("full_name", ""),
        "email": data.get("email"),
        "phone": data.get("phone"),
        "birth_date": _ts_to_date(data.get("birth_date")),
        "gender": _name(data.get("gender")),
        "address": data.get("address"),
        "image_path": data.get("image"),
        "faculty": _hemis_ref(data.get("faculty")),
        "department": _hemis_ref(data.get("department")),
        "specialty": _name(data.get("specialty")),
        "group": _hemis_ref(data.get("group")),
        "education_year": edu_year,
        "level": _code_int(data.get("level")),
        "semester": _code_int(data.get("semester")),
        "student_status": _name(data.get("studentStatus")),
        "education_form": _name(data.get("educationForm")),
        "education_type": _name(data.get("educationType")),
        "education_lang": _name(data.get("educationLang")),
        "payment_form": _name(data.get("paymentForm")),
    }


def _mock_login(username: str, password: str) -> dict:
    user = HEMIS_MOCK_USERS.get(username)
    if user:
        if user["password"] != password:
            raise HemisAuthError("Login yoki parol noto'g'ri")
        return _mock_to_profile(user)

    if not password:
        raise HemisAuthError("Login yoki parol noto'g'ri")
    return {
        "student_id_number": username,
        "full_name": f"Talaba {username}",
        "email": None, "phone": None, "birth_date": None, "gender": None,
        "address": None, "image_path": None,
        "faculty": None, "department": None, "specialty": None, "group": None,
        "education_year": None, "level": None, "semester": None,
        "student_status": None, "education_form": None, "education_type": None,
        "education_lang": None, "payment_form": None,
    }


def _mock_to_profile(user: dict) -> dict:
    """Convert the flat mock fixture into the unified normalized profile shape."""
    def ref(name: str | None) -> dict | None:
        return {"hemis_id": None, "code": None, "name": name} if name else None

    return {
        "student_id_number": user.get("student_id_number"),
        "full_name": user.get("full_name", ""),
        "email": user.get("email"),
        "phone": user.get("phone"),
        "birth_date": user.get("birth_date"),
        "gender": user.get("gender"),
        "address": user.get("address"),
        "image_path": user.get("image_path"),
        "faculty": ref(user.get("faculty_name")),
        "department": ref(user.get("department_name")),
        "specialty": user.get("specialty"),
        "group": ref(user.get("group")),
        "education_year": None,
        "level": user.get("level"),
        "semester": user.get("semester"),
        "student_status": user.get("student_status"),
        "education_form": user.get("education_form"),
        "education_type": user.get("education_type"),
        "education_lang": user.get("education_lang"),
        "payment_form": user.get("payment_form"),
    }


async def _real_login(username: str, password: str) -> dict:
    base = settings.hemis_base_url.rstrip("/")
    login_url = f"{base}{settings.hemis_login_path}"
    me_url = f"{base}{settings.hemis_me_path}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Step 1 — authenticate and get HEMIS token
        try:
            resp = await client.post(login_url, json={"login": username, "password": password})
        except httpx.HTTPError as exc:
            raise HemisError(f"HEMIS ulanish xatosi: {exc}") from exc

        try:
            payload = resp.json()
        except ValueError:
            raise HemisError(f"HEMIS noto'g'ri javob: {resp.status_code}")

        hemis_error = (payload.get("error") if isinstance(payload, dict) else None) or None

        if resp.status_code == 401 or payload.get("success") is False:
            raise HemisAuthError(hemis_error or "Login yoki parol noto'g'ri")
        if resp.status_code >= 400:
            raise HemisError(hemis_error or f"HEMIS xatoligi: {resp.status_code}")

        hemis_token = (payload.get("data") or {}).get("token") if isinstance(payload.get("data"), dict) else None
        if not hemis_token:
            raise HemisError("HEMIS token qaytarmadi")

        # Step 2 — fetch student profile
        try:
            me_resp = await client.get(
                me_url,
                headers={"Authorization": f"Bearer {hemis_token}"},
            )
        except httpx.HTTPError as exc:
            raise HemisError(f"HEMIS /me xatosi: {exc}") from exc

        try:
            me_payload = me_resp.json()
        except ValueError:
            raise HemisError(f"HEMIS /me noto'g'ri javob: {me_resp.status_code}")

        if me_resp.status_code >= 400 or me_payload.get("success") is False:
            err = me_payload.get("error") if isinstance(me_payload, dict) else None
            raise HemisError(err or f"HEMIS /me xatoligi: {me_resp.status_code}")

        data = me_payload.get("data") or {}

    profile = _normalize_profile(data)
    if not profile.get("student_id_number"):
        profile["student_id_number"] = username
    return profile


def _ts_to_date(value: int | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, int):
        from datetime import datetime, timezone
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc).strftime("%Y-%m-%d")
        except (OSError, OverflowError):
            return None
    return str(value)
