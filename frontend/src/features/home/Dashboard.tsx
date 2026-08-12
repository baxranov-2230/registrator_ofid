import { useSelector } from "react-redux";

import type { RootState } from "@/app/store";
import StudentDashboard from "@/features/home/StudentDashboard";
import StaffDashboard from "@/features/home/StaffDashboard";

/**
 * Routes each role to its landing page.
 *
 * Students get a service-catalogue page built around submitting and tracking
 * their own requests; every other role gets the operational view built around
 * the queue they are responsible for.
 */
export default function Dashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  if (!user) return null;

  return user.role.name === "student" ? (
    <StudentDashboard user={user} />
  ) : (
    <StaffDashboard user={user} />
  );
}
