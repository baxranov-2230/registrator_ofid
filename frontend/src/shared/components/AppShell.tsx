import { useState } from "react";
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
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/NotificationsNoneOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/PersonOutline";

import type { RootState } from "@/app/store";
import { loggedOut } from "@/features/auth/authSlice";
import { useLogoutMutation } from "@/features/auth/authApi";
import Sidebar, { SIDEBAR_WIDTH } from "@/shared/components/Sidebar";

export default function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s: RootState) => s.auth.user);
  const refreshToken = useSelector((s: RootState) => s.auth.refreshToken);
  const [logoutApi] = useLogoutMutation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const role = user?.role.name || "student";

  const handleLogout = async () => {
    setMenuAnchor(null);
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

  const initials = (user?.full_name || "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Sidebar role={role} />

      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", width: `calc(100% - ${SIDEBAR_WIDTH}px)` }}>
        <AppBar position="sticky">
          <Toolbar sx={{ gap: 2 }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" fontWeight={700}>
                {t(`role.${role}`)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.full_name}
              </Typography>
            </Box>

            <IconButton
              color="inherit"
              onClick={() => navigate("/notifications")}
              sx={{ color: "text.secondary" }}
            >
              <Badge color="error" variant="dot" invisible>
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

        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
