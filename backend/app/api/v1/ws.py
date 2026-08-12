import asyncio
import contextlib
import json
import logging
from collections import defaultdict

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.core.redis import get_redis
from app.core.security import decode_token, is_session_active

log = logging.getLogger(__name__)

router = APIRouter(tags=["ws"])

# Sockets live in one worker's memory, but a notification can be created in any
# worker. Fanning out through Redis pub/sub means every worker delivers to the
# sockets it owns (C-02).
PUBSUB_CHANNEL = "royd:notifications"


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.connections[user_id].add(ws)

    async def disconnect(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self.connections[user_id].discard(ws)
            if not self.connections[user_id]:
                self.connections.pop(user_id, None)

    async def push(self, user_id: int, payload: dict) -> None:
        """Publish to every worker; each delivers to its own local sockets."""
        message = json.dumps({"user_id": user_id, "payload": payload}, default=str)
        try:
            await get_redis().publish(PUBSUB_CHANNEL, message)
        except Exception as exc:
            # Real-time delivery is best-effort — the notification row is already
            # committed and the client will see it on next poll.
            log.warning("WS publish failed: %s", exc)
            await self.deliver_local(user_id, payload)

    async def deliver_local(self, user_id: int, payload: dict) -> None:
        sockets = list(self.connections.get(user_id, ()))
        if not sockets:
            return
        data = json.dumps(payload, default=str)
        for ws in sockets:
            try:
                await ws.send_text(data)
            except Exception as exc:
                log.warning("WS send failed for user %s: %s", user_id, exc)
                await self.disconnect(user_id, ws)


manager = ConnectionManager()
_listener_task: asyncio.Task | None = None


async def _pubsub_listener() -> None:
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(PUBSUB_CHANNEL)
    log.info("WS pub/sub listener subscribed to %s", PUBSUB_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                envelope = json.loads(message["data"])
                await manager.deliver_local(int(envelope["user_id"]), envelope["payload"])
            except Exception as exc:
                log.warning("Malformed pub/sub message: %s", exc)
    except asyncio.CancelledError:
        raise
    finally:
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe(PUBSUB_CHANNEL)
            await pubsub.aclose()


async def start_pubsub_listener() -> None:
    global _listener_task
    if _listener_task is None:
        _listener_task = asyncio.create_task(_pubsub_listener())


async def stop_pubsub_listener() -> None:
    global _listener_task
    if _listener_task is not None:
        _listener_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _listener_task
        _listener_task = None


@router.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = decode_token(token)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if payload.get("type") != "access":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    user_id = int(payload.get("sub", 0))
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    # Read the idle window without sliding it: an open socket and its keepalive
    # pings are not user activity, so they must not keep a session alive.
    if not await is_session_active(get_redis(), payload.get("sid") or ""):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(user_id, websocket)
    try:
        await websocket.send_text(json.dumps({"type": "connected"}))
        while True:
            # The client sends periodic pings; replying keeps proxies from
            # dropping an otherwise idle connection.
            text = await websocket.receive_text()
            if text == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.warning("WS error for user %s: %s", user_id, exc)
    finally:
        await manager.disconnect(user_id, websocket)
