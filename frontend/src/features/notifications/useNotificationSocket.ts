import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { RootState } from "@/app/store";
import { api, API_URL } from "@/shared/api/base";

const PING_INTERVAL_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function socketUrl(token: string): string {
  // API_URL is empty in dev, where Vite proxies /ws to the backend.
  const base = API_URL || window.location.origin;
  const url = new URL("/ws/notifications", base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Live notification stream (C-02).
 *
 * The backend had a working websocket endpoint that nothing connected to. On
 * each pushed notification we invalidate the notification list and the
 * dashboard counters rather than merging state by hand, so the server stays
 * the single source of truth.
 */
export function useNotificationSocket(): void {
  const dispatch = useDispatch();
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);

  const socketRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const closedByUsRef = useRef(false);

  useEffect(() => {
    if (!accessToken) return;

    closedByUsRef.current = false;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;

    const connect = () => {
      if (closedByUsRef.current) return;

      const ws = new WebSocket(socketUrl(accessToken));
      socketRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        let message: { type?: string };
        try {
          message = JSON.parse(event.data as string);
        } catch {
          return;
        }
        if (message.type === "notification") {
          dispatch(
            api.util.invalidateTags([
              { type: "Notification", id: "LIST" },
              { type: "Stats", id: "DASHBOARD" },
              { type: "Request", id: "LIST" },
            ]),
          );
        }
      };

      ws.onclose = () => {
        window.clearInterval(pingTimer);
        if (closedByUsRef.current) return;
        // Exponential backoff so a backend restart doesn't cause a hot loop.
        const delay = Math.min(1000 * 2 ** attemptsRef.current, MAX_RECONNECT_DELAY_MS);
        attemptsRef.current += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pingTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [accessToken, dispatch]);
}
