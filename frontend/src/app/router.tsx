import { createBrowserRouter, Navigate } from "react-router-dom";

import LoginPage from "@/features/auth/LoginPage";
import ForgotPasswordPage from "@/features/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/features/auth/ResetPasswordPage";
import ProfilePage from "@/features/auth/ProfilePage";
import RequireAuth from "@/features/auth/RequireAuth";
import AppShell from "@/shared/components/AppShell";
import HomeRedirect from "@/features/home/HomeRedirect";
import Dashboard from "@/features/home/Dashboard";
import StaffUsersPage from "@/features/admin/StaffUsersPage";
import StudentUsersPage from "@/features/admin/StudentUsersPage";
import FacultiesPage from "@/features/admin/FacultiesPage";
import GroupsPage from "@/features/admin/GroupsPage";
import CategoriesPage from "@/features/admin/CategoriesPage";
import AuditPage from "@/features/admin/AuditPage";
import ApiClientsPage from "@/features/admin/ApiClientsPage";
import NotificationsPage from "@/features/notifications/NotificationsPage";
import RequestDetailPage from "@/features/requests/RequestDetailPage";
import RegistratorInboxPage from "@/features/requests/RegistratorInboxPage";
import StaffQueuePage from "@/features/requests/StaffQueuePage";
import AllRequestsPage from "@/features/requests/AllRequestsPage";
import ReportsPage from "@/features/reports/ReportsPage";

// Route guards mirror the backend's role matrix (app/models/role.py). They are
// a UX affordance only — the API re-checks every request — but they must not
// promise access the server will refuse (A-02).
//
// There are no student routes: students file and follow requests on the
// partner platform, which uses the API directly. This app is for staff.
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <HomeRedirect /> },
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/notifications", element: <NotificationsPage /> },
          {
            element: <RequireAuth roles={["registrator", "admin"]} />,
            children: [
              { path: "/registrator/inbox", element: <RegistratorInboxPage /> },
              { path: "/registrator/requests/:id", element: <RequestDetailPage /> },
            ],
          },
          {
            element: <RequireAuth roles={["staff"]} />,
            children: [
              { path: "/staff/queue", element: <StaffQueuePage /> },
              { path: "/staff/requests/:id", element: <RequestDetailPage /> },
            ],
          },
          {
            // Leadership has read-only oversight: it may browse all requests
            // and the audit trail, but the management screens below are
            // admin-only on the server, so they are admin-only here too.
            element: <RequireAuth roles={["admin", "leadership"]} />,
            children: [
              { path: "/admin/requests", element: <AllRequestsPage /> },
              { path: "/admin/requests/:id", element: <RequestDetailPage /> },
              { path: "/admin/audit", element: <AuditPage /> },
              { path: "/admin/reports", element: <ReportsPage /> },
            ],
          },
          {
            element: <RequireAuth roles={["admin"]} />,
            children: [
              { path: "/admin/users", element: <StaffUsersPage /> },
              { path: "/admin/students", element: <StudentUsersPage /> },
              { path: "/admin/categories", element: <CategoriesPage /> },
              { path: "/admin/faculties", element: <FacultiesPage /> },
              { path: "/admin/groups", element: <GroupsPage /> },
              { path: "/admin/api-clients", element: <ApiClientsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
