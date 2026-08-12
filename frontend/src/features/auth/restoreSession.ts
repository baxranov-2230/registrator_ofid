import type { AppDispatch } from "@/app/store";
import { restoreFailed } from "@/features/auth/authSlice";
import { takeLegacyRefreshToken } from "@/features/auth/tokenStorage";
import { API_URL, refreshSession } from "@/shared/api/base";

/**
 * Rebuild the auth state on app start.
 *
 * The access token only ever lives in memory, so after a reload there is none.
 * The refresh token is an httpOnly cookie the browser still holds, so a single
 * call to /auth/refresh mints a new access token and the user stays signed in
 * — this is what stops F5 from landing on the login page.
 *
 * Resolves once the outcome is known; the dispatched status moves off
 * "restoring" either way, which is what releases the route guard.
 */
export async function restoreSession(dispatch: AppDispatch): Promise<boolean> {
  // A session created before the cookie existed still has its refresh token in
  // web storage. Spend it once to obtain a cookie session, then it is gone.
  const legacyToken = takeLegacyRefreshToken() ?? undefined;

  const ok = await refreshSession(
    {
      dispatch: dispatch as (action: unknown) => unknown,
      fetchRefresh: async (body) => {
        try {
          const resp = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
          });
          if (!resp.ok) return {};
          return { data: await resp.json() };
        } catch {
          // Network failure is not proof the session is invalid, but there is
          // nothing to restore right now either.
          return {};
        }
      },
    },
    legacyToken,
  );

  if (!ok) dispatch(restoreFailed());
  return ok;
}
