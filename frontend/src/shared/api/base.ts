import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";

import type { RootState } from "@/app/store";
import { tokensReceived, loggedOut } from "@/features/auth/authSlice";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${API_URL}/api/v1`,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithRefresh: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  apiCtx,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, apiCtx, extraOptions);
  if (result.error && result.error.status === 401) {
    const refresh = (apiCtx.getState() as RootState).auth.refreshToken;
    if (refresh) {
      const refreshResp = await rawBaseQuery(
        { url: "/auth/refresh", method: "POST", body: { refresh_token: refresh } },
        apiCtx,
        extraOptions,
      );
      if (refreshResp.data) {
        const { access_token, refresh_token } = refreshResp.data as {
          access_token: string;
          refresh_token: string;
        };
        apiCtx.dispatch(tokensReceived({ access: access_token, refresh: refresh_token }));
        result = await rawBaseQuery(args, apiCtx, extraOptions);
      } else {
        apiCtx.dispatch(loggedOut());
      }
    } else {
      apiCtx.dispatch(loggedOut());
    }
  }
  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["User", "Request", "Category", "Faculty", "Department", "Notification"],
  endpoints: () => ({}),
});

export { API_URL };
