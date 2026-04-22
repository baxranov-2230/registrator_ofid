import httpx

from app.core.config import settings
from app.services.hemis_mock import HEMIS_MOCK_USERS


class HemisError(Exception):
    pass


class HemisAuthError(HemisError):
    pass


async def hemis_login(username: str, password: str) -> dict:
    """Authenticate a student against HEMIS (or mock). Returns normalized profile dict.

    Expected fields: student_id_number, full_name, email (optional),
    faculty_name, department_name, phone (optional), group.
    """
    if settings.hemis_use_mock:
        return _mock_login(username, password)
    return await _real_login(username, password)


def _mock_login(username: str, password: str) -> dict:
    user = HEMIS_MOCK_USERS.get(username)
    if not user or user["password"] != password:
        raise HemisAuthError("Login yoki parol noto'g'ri")
    profile = {k: v for k, v in user.items() if k != "password"}
    return profile


async def _real_login(username: str, password: str) -> dict:
    url = f"{settings.hemis_base_url.rstrip('/')}/rest/v1/auth/login"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(url, json={"login": username, "password": password})
        except httpx.HTTPError as exc:
            raise HemisError(f"HEMIS ulanish xatosi: {exc}") from exc
    if resp.status_code == 401:
        raise HemisAuthError("Login yoki parol noto'g'ri")
    if resp.status_code >= 400:
        raise HemisError(f"HEMIS xatoligi: {resp.status_code}")
    payload = resp.json()
    data = payload.get("data") or payload
    return {
        "student_id_number": data.get("student_id_number") or data.get("id") or username,
        "full_name": data.get("full_name") or data.get("name", ""),
        "email": data.get("email"),
        "phone": data.get("phone"),
        "faculty_name": (data.get("faculty") or {}).get("name") if isinstance(data.get("faculty"), dict) else data.get("faculty_name"),
        "department_name": (data.get("department") or {}).get("name") if isinstance(data.get("department"), dict) else data.get("department_name"),
        "group": (data.get("group") or {}).get("name") if isinstance(data.get("group"), dict) else data.get("group"),
    }
