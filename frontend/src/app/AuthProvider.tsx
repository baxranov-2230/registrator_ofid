import { useEffect, useRef, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch, RootState } from "@/app/store";
import { restoreSession } from "@/features/auth/restoreSession";
import { useIdleTimeout } from "@/features/auth/useIdleTimeout";

/**
 * Owns the two session-wide concerns: restoring auth on start and expiring it
 * on inactivity.
 *
 * It sits above the router so the restore runs once per page load rather than
 * once per route change — navigating between routes must never re-trigger it.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const status = useSelector((s: RootState) => s.auth.status);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in development; the ref keeps that
    // from firing two refresh requests and rotating the token twice.
    if (started.current) return;
    started.current = true;
    if (status === "restoring") void restoreSession(dispatch);
  }, [status, dispatch]);

  useIdleTimeout();

  return <>{children}</>;
}
