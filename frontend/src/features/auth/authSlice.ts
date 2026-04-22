import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface AuthUser {
  id: number;
  full_name: string;
  email: string | null;
  role: { id: number; name: string };
  faculty_id: number | null;
  department_id: number | null;
  external_student_id: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
}

const ACCESS_KEY = "royd_access";
const REFRESH_KEY = "royd_refresh";

const initialState: AuthState = {
  accessToken: localStorage.getItem(ACCESS_KEY),
  refreshToken: localStorage.getItem(REFRESH_KEY),
  user: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    tokensReceived(state, action: PayloadAction<{ access: string; refresh: string }>) {
      state.accessToken = action.payload.access;
      state.refreshToken = action.payload.refresh;
      localStorage.setItem(ACCESS_KEY, action.payload.access);
      localStorage.setItem(REFRESH_KEY, action.payload.refresh);
    },
    userLoaded(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
    },
    loggedOut(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    },
  },
});

export const { tokensReceived, userLoaded, loggedOut } = authSlice.actions;
export default authSlice.reducer;
