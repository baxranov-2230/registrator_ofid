import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  AppBar,
  Box,
  Button,
  Container,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";

import type { RootState } from "@/app/store";
import { loggedOut } from "@/features/auth/authSlice";
import { useLogoutMutation } from "@/features/auth/authApi";

export default function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s: RootState) => s.auth.user);
  const refreshToken = useSelector((s: RootState) => s.auth.refreshToken);
  const [logoutApi] = useLogoutMutation();

  const role = user?.role.name;

  const handleLogout = async () => {
    if (refreshToken) {
      try {
        await logoutApi({ refresh_token: refreshToken }).unwrap();
      } catch {
        /* ignore */
      }
    }
    dispatch(loggedOut());
    navigate("/login");
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="sticky" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 0, mr: 4 }}>
            {t("app.name")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
            {role === "student" && (
              <>
                <NavBtn to="/student/requests">{t("nav.myRequests")}</NavBtn>
                <NavBtn to="/student/requests/new">{t("nav.newRequest")}</NavBtn>
              </>
            )}
            {role === "registrator" && <NavBtn to="/registrator/inbox">{t("nav.inbox")}</NavBtn>}
            {role === "staff" && <NavBtn to="/staff/queue">{t("nav.queue")}</NavBtn>}
            {role === "admin" && (
              <>
                <NavBtn to="/admin/users">{t("nav.users")}</NavBtn>
                <NavBtn to="/admin/categories">{t("nav.categories")}</NavBtn>
                <NavBtn to="/admin/audit">{t("nav.audit")}</NavBtn>
              </>
            )}
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2">{user?.full_name}</Typography>
            <IconButton color="inherit" onClick={handleLogout} title={t("auth.logout")}>
              <LogoutIcon />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}

function NavBtn({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Button
      component={NavLink}
      to={to}
      color="inherit"
      sx={{
        "&.active": { fontWeight: 700, textDecoration: "underline" },
      }}
    >
      {children}
    </Button>
  );
}
