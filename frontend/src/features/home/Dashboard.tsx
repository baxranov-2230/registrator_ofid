import { useSelector } from "react-redux";

import type { RootState } from "@/app/store";
import StaffDashboard from "@/features/home/StaffDashboard";

/**
 * Operational landing page. Every role that can sign in here is staff —
 * students use the partner platform — so there is a single dashboard.
 */
export default function Dashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  if (!user) return null;
  return <StaffDashboard user={user} />;
}
