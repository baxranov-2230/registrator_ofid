import type { ReactNode } from "react";

import DashboardIcon from "@mui/icons-material/SpaceDashboard";
import InboxIcon from "@mui/icons-material/Inbox";
import AddCircleIcon from "@mui/icons-material/AddCircleOutline";
import QueueIcon from "@mui/icons-material/FormatListBulleted";
import PeopleIcon from "@mui/icons-material/PeopleAltOutlined";
import CategoryIcon from "@mui/icons-material/CategoryOutlined";
import SchoolIcon from "@mui/icons-material/SchoolOutlined";
import HistoryIcon from "@mui/icons-material/HistoryEduOutlined";
import GroupsIcon from "@mui/icons-material/Groups";
import AssignmentIcon from "@mui/icons-material/AssignmentOutlined";
import NotificationsIcon from "@mui/icons-material/NotificationsNoneOutlined";
import PersonIcon from "@mui/icons-material/PersonOutline";
import BadgeIcon from "@mui/icons-material/BadgeOutlined";

export interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
}

// Must stay in sync with the guards in app/router.tsx, which in turn mirror the
// backend role matrix. A link here that the router or API refuses is a dead end
// for the user.
const NAV_BY_ROLE: Record<string, NavItem[]> = {
  student: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.myRequests", to: "/student/requests", icon: <AssignmentIcon /> },
    { label: "nav.newRequest", to: "/student/requests/new", icon: <AddCircleIcon /> },
    { label: "nav.notifications", to: "/notifications", icon: <NotificationsIcon /> },
    { label: "nav.profile", to: "/profile", icon: <PersonIcon /> },
  ],
  registrator: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.inbox", to: "/registrator/inbox", icon: <InboxIcon /> },
    { label: "nav.notifications", to: "/notifications", icon: <NotificationsIcon /> },
  ],
  staff: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.queue", to: "/staff/queue", icon: <QueueIcon /> },
    { label: "nav.notifications", to: "/notifications", icon: <NotificationsIcon /> },
  ],
  admin: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.allRequests", to: "/admin/requests", icon: <InboxIcon /> },
    { label: "nav.staffUsers", to: "/admin/users", icon: <BadgeIcon /> },
    { label: "nav.studentUsers", to: "/admin/students", icon: <PeopleIcon /> },
    { label: "nav.faculties", to: "/admin/faculties", icon: <SchoolIcon /> },
    { label: "nav.groups", to: "/admin/groups", icon: <GroupsIcon /> },
    { label: "nav.categories", to: "/admin/categories", icon: <CategoryIcon /> },
    { label: "nav.audit", to: "/admin/audit", icon: <HistoryIcon /> },
    { label: "nav.notifications", to: "/notifications", icon: <NotificationsIcon /> },
  ],
  // Read-only oversight. The management screens are admin-only on the server,
  // so they are deliberately absent here (A-02).
  leadership: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.allRequests", to: "/admin/requests", icon: <InboxIcon /> },
    { label: "nav.audit", to: "/admin/audit", icon: <HistoryIcon /> },
    { label: "nav.notifications", to: "/notifications", icon: <NotificationsIcon /> },
  ],
};

export function navItemsFor(role: string): NavItem[] {
  return NAV_BY_ROLE[role] || [];
}

/**
 * True when the current path should light up this nav entry.
 *
 * Prefix matching alone lit up two rows at once on nested routes: on
 * `/student/requests/new` both "Murojaatlarim" (`/student/requests`) and
 * "Yangi murojaat" matched. Only the longest matching entry wins, so a nested
 * route highlights the most specific link and nothing else.
 */
export function isNavActive(pathname: string, to: string, role?: string): boolean {
  if (pathname === to) return true;

  const matches = (target: string) =>
    pathname === target ||
    // Compare on a segment boundary so `/admin/user` never matches
    // `/admin/users`.
    (target !== "/dashboard" && pathname.startsWith(`${target}/`));

  if (!matches(to)) return false;

  // A more specific sibling claims the highlight instead.
  const siblings = role ? navItemsFor(role).map((i) => i.to) : [];
  return !siblings.some((other) => other !== to && other.length > to.length && matches(other));
}
