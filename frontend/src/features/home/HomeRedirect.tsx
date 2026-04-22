import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

import type { RootState } from "@/app/store";

export default function HomeRedirect() {
  const user = useSelector((s: RootState) => s.auth.user);
  if (!user) return null;
  return <Navigate to="/dashboard" replace />;
}
