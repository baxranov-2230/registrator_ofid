import asyncio
import json
import logging
from collections import defaultdict

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.core.security import decode_token

log = logging.getLogger(__name__)

router = APIRouter(tags=["ws"])


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
                del self.connections[user_id]

    async def push(self, user_id: int, payload: dict) -> None:
        sockets = list(self.connections.get(user_id, ()))
        data = json.dumps(payload, default=str)
        for ws in sockets:
            try:
                await ws.send_text(data)
            except Exception as exc:
                log.warning("WS push failed: %s", exc)


manager = ConnectionManager()


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

    await manager.connect(user_id, websocket)
    try:
        await websocket.send_text(json.dumps({"type": "connected"}))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, websocket)
