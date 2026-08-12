import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch, RootState } from "@/app/store";
import { loggedOut } from "@/features/auth/authSlice";
import { api } from "@/shared/api/base";

/** Must match the backend's SESSION_IDLE_TIMEOUT_MINUTES. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "click",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
  "visibilitychange",
] as const;

/** Shared across tabs so activity in one keeps the others alive. */
const LAST_ACTIVE_KEY = "royd_last_active";

function readLastActive(): number {
  const raw = localStorage.getItem(LAST_ACTIVE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * End the session after 30 minutes with no user activity.
 *
 * This is an inactivity timeout, not a token lifetime: as long as the user is
 * doing anything at all, the session is renewed indefinitely. The backend
 * enforces the same window (a stopped tab cannot be trusted to log itself
 * out); this side exists so an idle user is returned to the login page
 * promptly rather than on their next click.
 */
export function useIdleTimeout(): void {
  const dispatch = useDispatch<AppDispatch>();
  const status = useSelector((s: RootState) => s.auth.status);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    const expire = () => {
      dispatch(loggedOut());
      dispatch(api.util.resetApiState());
    };

    const schedule = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      // Time from the last recorded activity, not from now — a tab that was
      // backgrounded (and had its timers throttled) still expires on schedule,
      // and a tab woken from sleep expires immediately rather than granting a
      // fresh 30 minutes.
      const remaining = readLastActive() + IDLE_TIMEOUT_MS - Date.now();
      if (remaining <= 0) {
        expire();
        return;
      }
      timerRef.current = window.setTimeout(schedule, remaining);
    };

    // Throttled: mousemove alone would otherwise write to localStorage
    // hundreds of times a second for no benefit.
    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < 1000) return;
      lastWrite = now;
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
      schedule();
    };

    // Another tab reporting activity counts as activity here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVE_KEY) schedule();
    };

    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    schedule();

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    window.addEventListener("storage", onStorage);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, onActivity);
      window.removeEventListener("storage", onStorage);
    };
  }, [status, dispatch]);
}
