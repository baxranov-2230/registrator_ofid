import { api } from "@/shared/api/base";
import type { AuthUser } from "@/features/auth/authSlice";

interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

/**
 * Either tokens, or — when the account has 2FA on — an `mfa_token` to send
 * back with the authenticator code to `/auth/login/2fa`.
 */
export interface LoginResponse {
  access_token: string | null;
  refresh_token: string | null;
  token_type: string;
  mfa_required: boolean;
  mfa_token: string | null;
}

export interface TotpSetup {
  secret: string;
  otpauth_url: string;
  /** SVG data URI of the QR code for the authenticator app. */
  qr_svg: string;
}

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    loginStaff: build.mutation<LoginResponse, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
    }),
    loginSecondFactor: build.mutation<LoginResponse, { mfa_token: string; code: string }>({
      query: (body) => ({ url: "/auth/login/2fa", method: "POST", body }),
    }),
    getMe: build.query<AuthUser, void>({
      query: () => "/auth/me",
      providesTags: ["User"],
    }),
    // The refresh token is read from the httpOnly cookie server-side, so the
    // client has nothing to send.
    logout: build.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST", body: {} }),
    }),
    changePassword: build.mutation<
      TokenPair,
      { current_password: string; new_password: string }
    >({
      query: (body) => ({ url: "/auth/change-password", method: "POST", body }),
    }),
    forgotPassword: build.mutation<void, { email: string }>({
      query: (body) => ({ url: "/auth/password/forgot", method: "POST", body }),
    }),
    resetPassword: build.mutation<void, { token: string; new_password: string }>({
      query: (body) => ({ url: "/auth/password/reset", method: "POST", body }),
    }),
    setupTotp: build.mutation<TotpSetup, void>({
      query: () => ({ url: "/auth/2fa/setup", method: "POST" }),
    }),
    enableTotp: build.mutation<void, { code: string }>({
      query: (body) => ({ url: "/auth/2fa/enable", method: "POST", body }),
      invalidatesTags: ["User"],
    }),
    disableTotp: build.mutation<void, { password: string; code: string }>({
      query: (body) => ({ url: "/auth/2fa/disable", method: "POST", body }),
      invalidatesTags: ["User"],
    }),
  }),
});

export const {
  useLoginStaffMutation,
  useLoginSecondFactorMutation,
  useGetMeQuery,
  useLogoutMutation,
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useSetupTotpMutation,
  useEnableTotpMutation,
  useDisableTotpMutation,
} = authApi;
