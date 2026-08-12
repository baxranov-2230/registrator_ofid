import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import {
  clearTokens,
  getAccessToken,
  hasSessionHint,
  setAccessToken,
  setSessionHint,
} from "@/features/auth/tokenStorage";

export interface AuthUser {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: { id: number; name: string; description?: string | null };
  faculty_id: number | null;
  department_id: number | null;
  external_student_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  birth_date: string | null;
  gender: string | null;
  address: string | null;
  image_path: string | null;
  specialty: string | null;
  group_name: string | null;
  level: number | null;
  semester: number | null;
  student_status: string | null;
  education_form: string | null;
  education_type: string | null;
  education_lang: string | null;
  payment_form: string | null;
}

/**
 * "restoring" is the state that fixes the reload bug.
 *
 * The access token is memory-only, so every fresh load starts with none. The
 * old code read that as "logged out" and redirected to /login before anything
 * could try the refresh token. Booting into "restoring" instead makes the
 * guard wait for the silent refresh to resolve.
 */
export type AuthStatus = "restoring" | "authenticated" | "anonymous";

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  status: AuthStatus;
}

const initialState: AuthState = {
  accessToken: getAccessToken(),
  user: null,
  // Only attempt a restore if this browser ever had a session; otherwise go
  // straight to the login page with no wasted round-trip or spinner flash.
  status: hasSessionHint() ? "restoring" : "anonymous",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    tokensReceived(state, action: PayloadAction<{ access: string }>) {
      state.accessToken = action.payload.access;
      state.status = "authenticated";
      setAccessToken(action.payload.access);
      setSessionHint(true);
    },
    userLoaded(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = "authenticated";
    },
    /** Restore finished with no usable session — but this is not a logout. */
    restoreFailed(state) {
      state.accessToken = null;
      state.user = null;
      state.status = "anonymous";
      clearTokens();
    },
    loggedOut(state) {
      state.accessToken = null;
      state.user = null;
      state.status = "anonymous";
      clearTokens();
    },
  },
});

export const { tokensReceived, userLoaded, restoreFailed, loggedOut } = authSlice.actions;
export default authSlice.reducer;
