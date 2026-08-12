import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import NotificationsIcon from "@mui/icons-material/NotificationsNoneOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/PersonOutline";

import type { RootState } from "@/app/store";
import { loggedOut } from "@/features/auth/authSlice";
import { useLogoutMutation } from "@/features/auth/authApi";
import { api } from "@/shared/api/base";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher";
import Sidebar, {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_WIDTH,
} from "@/shared/components/Sidebar";
import BottomNav from "@/shared/components/BottomNav";
import { useListNotificationsQuery } from "@/features/notifications/notificationsApi";
import { useNotificationSocket } from "@/features/notifications/useNotificationSocket";

const COLLAPSE_KEY = "royd_sidebar_collapsed";

export default function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s: RootState) => s.auth.user);
  const [logoutApi] = useLogoutMutation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const theme = useTheme();
  // Below `md` the sidebar cannot coexist with the content: at 320px a fixed
  // 260px rail would leave 60px for the page.
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  // Remembered so the choice survives navigation and reloads.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === "1",
  );

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Leaving mobile with the overlay open would otherwise strand a backdrop
  // over the desktop layout.
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  // Live push, plus a poll as a fallback if the socket cannot connect.
  useNotificationSocket();
  const { data: notifications = [] } = useListNotificationsQuery(
    { unread_only: true, limit: 50 },
    { pollingInterval: 120_000 },
  );
  const unreadCount = notifications.length;

  const role = user?.role.name || "student";

  const handleLogout = async () => {
    setMenuAnchor(null);
    try {
      // Revokes the refresh token and clears the cookie server-side.
      await logoutApi().unwrap();
    } catch {
      /* ignore — the local session is cleared either way */
    }
    dispatch(loggedOut());
    dispatch(api.util.resetApiState());
    navigate("/login");
  };

  const initials = (user?.full_name || "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Sidebar
        role={role}
        isMobile={isMobile}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={handleLogout}
      />

      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          // On mobile the drawer floats, so the content owns the full width.
          // `minWidth: 0` lets children shrink instead of forcing a page-wide
          // horizontal scrollbar.
          width: {
            xs: "100%",
            md: `calc(100% - ${collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH}px)`,
          },
          minWidth: 0,
        }}
      >
        <AppBar position="sticky">
          <Toolbar sx={{ gap: { xs: 1, sm: 2 } }}>
            {/* One control in one place: on mobile it opens the overlay, on
                desktop it collapses the sidebar to the icon rail. */}
            <Tooltip
              title={
                isMobile
                  ? t("nav.openMenu")
                  : collapsed
                    ? t("nav.expandMenu")
                    : t("nav.collapseMenu")
              }
            >
              <IconButton
                edge="start"
                onClick={() =>
                  isMobile ? setMobileOpen(true) : setCollapsed((v) => !v)
                }
                aria-label={
                  isMobile
                    ? t("nav.openMenu")
                    : collapsed
                      ? t("nav.expandMenu")
                      : t("nav.collapseMenu")
                }
                aria-expanded={isMobile ? mobileOpen : !collapsed}
                sx={{ color: "text.primary" }}
              >
                <MenuIcon />
              </IconButton>
            </Tooltip>

            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700} noWrap sx={{ fontSize: { xs: "1rem", sm: "1.25rem" } }}>
                {t(`role.${role}`)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {user?.full_name}
              </Typography>
            </Box>

            <LanguageSwitcher />

            <IconButton
              color="inherit"
              onClick={() => navigate("/notifications")}
              sx={{ color: "text.secondary" }}
              aria-label={t("nav.notifications")}
            >
              <Badge color="error" badgeContent={unreadCount} max={99}>
                <NotificationsIcon />
              </Badge>
            </IconButton>

            <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
              <Avatar
                src={user?.image_path || undefined}
                sx={{
                  width: 36,
                  height: 36,
                  fontSize: 14,
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
                }}
              >
                {initials}
              </Avatar>
            </IconButton>

            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              slotProps={{
                paper: {
                  sx: { mt: 1, minWidth: 220, borderRadius: 3, boxShadow: "0 8px 24px rgba(15,23,42,0.08)" },
                },
              }}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={700} noWrap>
                  {user?.full_name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {user?.email || user?.external_student_id}
                </Typography>
              </Box>
              <Divider />
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  navigate("/profile");
                }}
              >
                <ListItemIcon>
                  <PersonIcon fontSize="small" />
                </ListItemIcon>
                {t("nav.profile")}
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" color="error" />
                </ListItemIcon>
                <Typography color="error">{t("auth.logout")}</Typography>
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, md: 4 },
            minWidth: 0,
            // Reserve room for the fixed bottom bar plus the safe-area inset,
            // otherwise the last control on a page sits underneath it.
            pb: isMobile ? "calc(76px + env(safe-area-inset-bottom))" : undefined,
          }}
        >
          <Outlet />
        </Box>
      </Box>

      {isMobile && <BottomNav role={role} onMore={() => setMobileOpen(true)} />}
    </Box>
  );
}
