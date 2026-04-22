import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { CircularProgress, Box } from "@mui/material";

import type { RootState } from "@/app/store";
import { useGetMeQuery } from "@/features/auth/authApi";
import { userLoaded, loggedOut } from "@/features/auth/authSlice";

export default function RequireAuth({ roles }: { roles?: string[] }) {
  const dispatch = useDispatch();
  const location = useLocation();
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);
  const user = useSelector((s: RootState) => s.auth.user);

  const { data, isLoading, isError } = useGetMeQuery(undefined, { skip: !accessToken || !!user });

  useEffect(() => {
    if (data) dispatch(userLoaded(data));
    if (isError) dispatch(loggedOut());
  }, [data, isError, dispatch]);

  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (isLoading && !user) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (roles && user && !roles.includes(user.role.name)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
