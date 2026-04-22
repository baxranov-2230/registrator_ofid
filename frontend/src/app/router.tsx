import { createBrowserRouter, Navigate } from "react-router-dom";

import LoginPage from "@/features/auth/LoginPage";
import RequireAuth from "@/features/auth/RequireAuth";
import AppShell from "@/shared/components/AppShell";
import HomeRedirect from "@/features/home/HomeRedirect";
import Placeholder from "@/features/common/Placeholder";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <HomeRedirect /> },
          { path: "/profile", element: <Placeholder title="Profil" /> },
          { path: "/notifications", element: <Placeholder title="Bildirishnomalar" /> },
          {
            element: <RequireAuth roles={["student"]} />,
            children: [
              { path: "/student/requests", element: <Placeholder title="Mening murojaatlarim" /> },
              { path: "/student/requests/new", element: <Placeholder title="Yangi murojaat" /> },
              { path: "/student/requests/:id", element: <Placeholder title="Murojaat" /> },
            ],
          },
          {
            element: <RequireAuth roles={["registrator", "admin"]} />,
            children: [
              { path: "/registrator/inbox", element: <Placeholder title="Kiruvchi murojaatlar" /> },
              { path: "/registrator/requests/:id", element: <Placeholder title="Murojaat" /> },
            ],
          },
          {
            element: <RequireAuth roles={["staff"]} />,
            children: [
              { path: "/staff/queue", element: <Placeholder title="Ish navbatim" /> },
              { path: "/staff/requests/:id", element: <Placeholder title="Murojaat" /> },
            ],
          },
          {
            element: <RequireAuth roles={["admin", "leadership"]} />,
            children: [
              { path: "/admin/users", element: <Placeholder title="Foydalanuvchilar" /> },
              { path: "/admin/categories", element: <Placeholder title="Murojaat turlari" /> },
              { path: "/admin/faculties", element: <Placeholder title="Fakultetlar" /> },
              { path: "/admin/audit", element: <Placeholder title="Audit jurnali" /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
