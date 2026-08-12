"""Session lifetime: refresh rotation, cookie handling and the idle timeout.

These cover the scenarios that the "logged out on F5" report turned up. The
frontend keeps the access token in memory only, so a page reload has nothing
but the refresh cookie to work with — every reload therefore exercises the
refresh endpoint, and these tests pin down what it must do.
"""

import pytest

from app.core.config import settings
from app.core.security import SESSION_SEEN_PREFIX, decode_token

COOKIE = settings.refresh_cookie_name


async def _login(client) -> dict:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@test.uz", "password": "parol12345"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _session_id(token: str) -> str:
    return decode_token(token)["sid"]


def _go_idle(fake_redis, session_id: str) -> None:
    """Simulate the idle window lapsing.

    The real key expires by TTL; FakeRedis ignores TTLs, so deleting it is the
    equivalent observable state.
    """
    fake_redis.store.pop(f"{SESSION_SEEN_PREFIX}{session_id}", None)


async def test_login_sets_httponly_refresh_cookie(client):
    """Scenario 5: a normal login issues both tokens, refresh one via cookie."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@test.uz", "password": "parol12345"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] and body["refresh_token"]

    cookie = resp.cookies.get(COOKIE)
    assert cookie, "refresh token must be set as a cookie"

    set_cookie = resp.headers["set-cookie"]
    assert "HttpOnly" in set_cookie, "refresh cookie must be httpOnly"
    assert f"Path={settings.refresh_cookie_path}" in set_cookie

    # The two tokens are distinct and typed.
    assert decode_token(body["access_token"])["type"] == "access"
    assert decode_token(body["refresh_token"])["type"] == "refresh"


async def test_reload_restores_session_from_cookie_alone(client):
    """Scenario 1 & 8: F5 keeps the user signed in.

    A reload drops the in-memory access token. With only the cookie the client
    must still be able to obtain a working access token — this is precisely the
    bug where the app redirected to /login instead.
    """
    await _login(client)

    # No Authorization header and no body: exactly what a fresh page load has.
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 200, resp.text
    access = resp.json()["access_token"]

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200
    assert me.json()["email"] == "admin@test.uz"


async def test_reload_with_empty_json_body(client):
    """Scenario 1, as the browser actually sends it.

    The frontend posts `{}` with a JSON content-type. Making refresh_token a
    required field meant FastAPI answered 422 before the cookie was ever
    looked at, so every reload logged the user out — the original bug, in a
    second form. Sending no body at all masked it, so this pins the real shape.
    """
    await _login(client)

    resp = await client.post("/api/v1/auth/refresh", json={})
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]


async def test_reload_with_explicit_null_refresh_token(client):
    """A client that serialises the absent field as null must also work."""
    await _login(client)

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": None})
    assert resp.status_code == 200, resp.text


async def test_logout_with_empty_json_body(client):
    """Logout is posted the same way, and must not 422 either."""
    await _login(client)
    assert (await client.post("/api/v1/auth/logout", json={})).status_code == 204


async def test_expired_access_token_is_replaced_via_refresh(client):
    """Scenario 2: the access token expiring does not end the session."""
    tokens = await _login(client)
    original_access = tokens["access_token"]

    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 200
    new_access = resp.json()["access_token"]

    assert new_access != original_access
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200


async def test_refresh_rotates_and_revokes_the_old_token(client):
    """A used refresh token must not work twice (rotation + replay defence)."""
    tokens = await _login(client)
    old_refresh = tokens["refresh_token"]

    first = await client.post("/api/v1/auth/refresh")
    assert first.status_code == 200
    assert first.json()["refresh_token"] != old_refresh

    # Replaying the superseded token, explicitly in the body.
    client.cookies.delete(COOKIE, path=settings.refresh_cookie_path)
    replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert replay.status_code == 401


async def test_session_id_survives_refresh_rotation(client):
    """The idle window must be continuous across a rotation, not reset."""
    tokens = await _login(client)
    before = _session_id(tokens["access_token"])

    resp = await client.post("/api/v1/auth/refresh")
    after = _session_id(resp.json()["access_token"])

    assert before == after


async def test_active_user_stays_signed_in(client, fake_redis):
    """Scenario 3: activity renews the session past the 30-minute mark.

    Each authenticated request re-arms the idle key, so a user who keeps
    working is never logged out by the timeout.
    """
    tokens = await _login(client)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    sid = _session_id(tokens["access_token"])
    key = f"{SESSION_SEEN_PREFIX}{sid}"

    for _ in range(3):
        # Stand in for time passing: the key would be near expiry, and the
        # request must push it back out.
        fake_redis.store.pop(key, None)
        fake_redis.store[key] = "1"
        assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 200
        assert key in fake_redis.store, "an API call must renew the idle window"

    # And a refresh after all that activity still works.
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200


async def test_idle_session_is_rejected_and_cookie_cleared(client, fake_redis):
    """Scenario 4: 30+ minutes idle ends the session despite a valid token."""
    tokens = await _login(client)
    sid = _session_id(tokens["access_token"])
    _go_idle(fake_redis, sid)

    # The access token is still cryptographically valid, but the session is over.
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 401

    # And the refresh token cannot resurrect it — this is what sends the user
    # to the login page rather than silently renewing.
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401
    assert "inactivity" in resp.json()["detail"].lower()
    # The dead cookie must be cleared, or the browser keeps re-sending a token
    # that can never work again.
    set_cookie = resp.headers.get("set-cookie", "")
    assert COOKIE in set_cookie and "Max-Age=0" in set_cookie


async def test_idle_refresh_token_cannot_be_reused_after_rejection(client, fake_redis):
    """An idle-rejected refresh token is revoked, not merely refused once."""
    tokens = await _login(client)
    _go_idle(fake_redis, _session_id(tokens["access_token"]))

    assert (await client.post("/api/v1/auth/refresh")).status_code == 401

    # Even if the session key somehow reappeared, the token is now blocklisted.
    fake_redis.store[f"{SESSION_SEEN_PREFIX}{_session_id(tokens['access_token'])}"] = "1"
    retry = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert retry.status_code == 401


@pytest.mark.parametrize(
    "bad_token",
    ["not-a-jwt", "", "eyJhbGciOiJIUzI1NiJ9.bogus.bogus"],
)
async def test_invalid_refresh_token_is_refused(client, bad_token):
    """Scenario 6: a malformed or missing refresh token means the login page."""
    client.cookies.clear()
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": bad_token})
    assert resp.status_code == 401


async def test_refresh_without_any_token_is_refused(client):
    """Scenario 6: no cookie, no body — nothing to restore."""
    client.cookies.clear()
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


async def test_access_token_rejected_at_refresh_endpoint(client):
    """An access token must not be usable to mint more tokens."""
    tokens = await _login(client)
    client.cookies.clear()
    resp = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]}
    )
    assert resp.status_code == 401


async def test_logout_revokes_session_and_clears_cookie(client):
    """Logout ends the session for both token types."""
    tokens = await _login(client)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    resp = await client.post("/api/v1/auth/logout")
    assert resp.status_code == 204

    # The refresh token is revoked...
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    ).status_code == 401
    # ...and the access token's session is gone, so it stops working too.
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401


async def test_logout_without_credentials_is_safe(client):
    """Logging out twice, or with no cookie, must not error."""
    client.cookies.clear()
    assert (await client.post("/api/v1/auth/logout")).status_code == 204


async def test_concurrent_refreshes_leave_one_usable_session(client):
    """Scenario 7, server side.

    The frontend coalesces parallel 401s into a single refresh. Should two
    still race, rotation means only one survives — the losers must fail
    cleanly rather than corrupting the session.
    """
    tokens = await _login(client)
    refresh_token = tokens["refresh_token"]
    client.cookies.clear()

    first = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    # Drop the cookie the first response set, so the replay really does present
    # the superseded token rather than the freshly issued one.
    client.cookies.clear()
    second = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})

    assert first.status_code == 200
    assert second.status_code == 401

    access = first.json()["access_token"]
    assert (
        await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    ).status_code == 200
