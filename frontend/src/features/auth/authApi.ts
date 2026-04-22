import { api } from "@/shared/api/base";
import type { AuthUser } from "@/features/auth/authSlice";

interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    loginStaff: build.mutation<TokenPair, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
    }),
    loginStudent: build.mutation<TokenPair, { username: string; password: string }>({
      query: (body) => ({ url: "/auth/login/hemis", method: "POST", body }),
    }),
    getMe: build.query<AuthUser, void>({
      query: () => "/auth/me",
      providesTags: ["User"],
    }),
    logout: build.mutation<void, { refresh_token: string }>({
      query: (body) => ({ url: "/auth/logout", method: "POST", body }),
    }),
  }),
});

export const { useLoginStaffMutation, useLoginStudentMutation, useGetMeQuery, useLogoutMutation } =
  authApi;
