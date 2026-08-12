import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";

import type { RootState } from "@/app/store";
import { tokensReceived, loggedOut } from "@/features/auth/authSlice";

const API_URL = import.meta.env.VITE_API_URL || "";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${API_URL}/api/v1`,
  // The refresh token is an httpOnly cookie, so it only reaches /auth/refresh
  // if credentials ride along with the request.
  credentials: "include",
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

/**
 * In-flight refresh, shared by every caller.
 *
 * The backend rotates refresh tokens and revokes the old jti on use. Without
 * this guard, a page that fires several queries at once would send several
 * parallel refreshes; the first succeeds and invalidates the token the others
 * are still using, so they fail and log the user out mid-session. Every 401
 * awaits the same promise, so exactly one refresh request goes out.
 */
let refreshInFlight: Promise<boolean> | null = null;

type RefreshDeps = {
  dispatch: (action: unknown) => unknown;
  fetchRefresh: (body?: { refresh_token: string }) => Promise<{ data?: unknown }>;
};

async function runRefresh({ dispatch, fetchRefresh }: RefreshDeps, legacyToken?: string) {
  const resp = await fetchRefresh(legacyToken ? { refresh_token: legacyToken } : undefined);
  if (!resp.data) return false;
  const { access_token } = resp.data as { access_token: string };
  if (!access_token) return false;
  dispatch(tokensReceived({ access: access_token }));
  return true;
}

/** Refresh once, coalescing concurrent callers onto a single request. */
export function refreshSession(deps: RefreshDeps, legacyToken?: string): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh(deps, legacyToken).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

const baseQueryWithRefresh: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  apiCtx,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, apiCtx, extraOptions);
  if (result.error?.status !== 401) return result;

  // A 401 from the refresh endpoint itself means the session is genuinely
  // over; retrying it would loop.
  const url = typeof args === "string" ? args : args.url;
  if (url.startsWith("/auth/refresh")) return result;

  const refreshed = await refreshSession({
    dispatch: apiCtx.dispatch,
    fetchRefresh: (body) =>
      rawBaseQuery(
        { url: "/auth/refresh", method: "POST", body: body ?? {} },
        apiCtx,
        extraOptions,
      ) as Promise<{ data?: unknown }>,
  });

  if (refreshed) {
    // Replay the original request with the new access token.
    result = await rawBaseQuery(args, apiCtx, extraOptions);
  } else {
    apiCtx.dispatch(loggedOut());
    apiCtx.dispatch(api.util.resetApiState());
  }
  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithRefresh,
  tagTypes: [
    "User",
    "Request",
    "Category",
    "Faculty",
    "Department",
    "Group",
    "Notification",
    "Stats",
  ],
  endpoints: () => ({}),
});

export { API_URL };
