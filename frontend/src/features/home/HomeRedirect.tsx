import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

import type { RootState } from "@/app/store";

export default function HomeRedirect() {
  const user = useSelector((s: RootState) => s.auth.user);
  if (!user) return null;
  switch (user.role.name) {
    case "student":
      return <Navigate to="/student/requests" replace />;
    case "registrator":
      return <Navigate to="/registrator/inbox" replace />;
    case "staff":
      return <Navigate to="/staff/queue" replace />;
    case "admin":
      return <Navigate to="/admin/users" replace />;
    case "leadership":
      return <Navigate to="/admin/audit" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}
