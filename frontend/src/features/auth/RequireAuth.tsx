import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { CircularProgress, Box } from "@mui/material";

import type { RootState } from "@/app/store";
import { useGetMeQuery } from "@/features/auth/authApi";
import { userLoaded } from "@/features/auth/authSlice";

function Spinner() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
      <CircularProgress />
    </Box>
  );
}

export default function RequireAuth({ roles }: { roles?: string[] }) {
  const dispatch = useDispatch();
  const location = useLocation();
  const status = useSelector((s: RootState) => s.auth.status);
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);
  const user = useSelector((s: RootState) => s.auth.user);

  const { data } = useGetMeQuery(undefined, { skip: !accessToken || !!user });

  useEffect(() => {
    if (data) dispatch(userLoaded(data));
  }, [data, dispatch]);

  // A reload starts here: the access token is gone but the refresh cookie may
  // still be good, so wait for the silent refresh rather than redirecting.
  // Redirecting on a missing access token was the bug that logged users out
  // on F5.
  if (status === "restoring") return <Spinner />;

  if (status === "anonymous") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated, but the profile needed for the role check is still loading.
  if (!user) return <Spinner />;

  if (roles && !roles.includes(user.role.name)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
