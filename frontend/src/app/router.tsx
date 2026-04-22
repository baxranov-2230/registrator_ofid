import { createBrowserRouter, Navigate } from "react-router-dom";

import LoginPage from "@/features/auth/LoginPage";
import ProfilePage from "@/features/auth/ProfilePage";
import RequireAuth from "@/features/auth/RequireAuth";
import AppShell from "@/shared/components/AppShell";
import HomeRedirect from "@/features/home/HomeRedirect";
import Dashboard from "@/features/home/Dashboard";
import UsersPage from "@/features/admin/UsersPage";
import FacultiesPage from "@/features/admin/FacultiesPage";
import GroupsPage from "@/features/admin/GroupsPage";
import CategoriesPage from "@/features/admin/CategoriesPage";
import AuditPage from "@/features/admin/AuditPage";
import Placeholder from "@/features/common/Placeholder";
import NewRequestPage from "@/features/requests/NewRequestPage";
import MyRequestsPage from "@/features/requests/MyRequestsPage";
import RequestDetailPage from "@/features/requests/RequestDetailPage";
import RegistratorInboxPage from "@/features/requests/RegistratorInboxPage";
import StaffQueuePage from "@/features/requests/StaffQueuePage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <HomeRedirect /> },
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/notifications", element: <Placeholder title="Bildirishnomalar" /> },
          {
            element: <RequireAuth roles={["student"]} />,
            children: [
              { path: "/student/requests", element: <MyRequestsPage /> },
              { path: "/student/requests/new", element: <NewRequestPage /> },
              { path: "/student/requests/:id", element: <RequestDetailPage /> },
            ],
          },
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
            element: <RequireAuth roles={["admin", "leadership"]} />,
            children: [
              { path: "/admin/users", element: <UsersPage /> },
              { path: "/admin/categories", element: <CategoriesPage /> },
              { path: "/admin/faculties", element: <FacultiesPage /> },
              { path: "/admin/groups", element: <GroupsPage /> },
              { path: "/admin/audit", element: <AuditPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
