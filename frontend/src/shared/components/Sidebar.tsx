import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar, Box, Chip, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip, Typography } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import type { AuthUser } from "@/features/auth/authSlice";
import { isNavActive, navItemsFor } from "@/shared/navItems";
import { useUnreadNotificationCountQuery } from "@/features/notifications/notificationsApi";
import BrandMark from "@/shared/components/BrandMark";

export const SIDEBAR_WIDTH = 275;
export const SIDEBAR_COLLAPSED_WIDTH = 76;

interface Props {
  role: string;
  user: AuthUser | null;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isMobile: boolean;
  onLogout: () => void;
}

export default function Sidebar({ role, user, collapsed, mobileOpen, onCloseMobile, isMobile, onLogout }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const items = navItemsFor(role);
  const { data: unread } = useUnreadNotificationCountQuery();
  const unreadCount = unread?.count ?? 0;
  const showLabels = isMobile || !collapsed;
  const width = showLabels ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
  const initials = (user?.full_name || "").split(" ").map((part) => part[0]).slice(0, 2).join("");

  const content = (
    <>
      <Stack component={NavLink} to="/dashboard" onClick={isMobile ? onCloseMobile : undefined} direction="row" alignItems="center" spacing={1.5}
        sx={{ px: showLabels ? 2.5 : 0, height: 72, flexShrink: 0, justifyContent: showLabels ? "flex-start" : "center", borderBottom: "1px solid", borderColor: "divider", color: "text.primary", textDecoration: "none" }}>
        <BrandMark size={38} />
        {showLabels && <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.6px" }}>ROYD</Typography>
          <Typography variant="caption" color="text.secondary">{t("app.tagline")}</Typography>
        </Box>}
      </Stack>

      <Box sx={{ px: showLabels ? 2 : 1, pt: 1.5, pb: 1 }}>
        <Tooltip title={showLabels ? "" : t("nav.profile")} placement="right">
          <ListItemButton component={NavLink} to="/profile" onClick={isMobile ? onCloseMobile : undefined}
            sx={{ bgcolor: "background.default", p: showLabels ? 1.25 : 1, minHeight: 64, gap: 1.25, justifyContent: "center", borderRadius: "12px" }}>
            <Avatar src={user?.image_path || undefined} sx={{ width: 38, height: 38, fontSize: 14, bgcolor: "primary.light", color: "primary.dark", fontWeight: 600 }}>{initials}</Avatar>
            {showLabels && <>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap>{user?.full_name}</Typography>
                <Typography variant="caption" color="text.secondary">{t(`role.${role}`)}</Typography>
              </Box>
              <ChevronRightIcon sx={{ fontSize: 18, color: "text.secondary" }} />
            </>}
          </ListItemButton>
        </Tooltip>
      </Box>

      <Box sx={{ px: showLabels ? 2 : 1, py: 1, flexGrow: 1, overflowY: "auto", overflowX: "hidden" }}>
        <List disablePadding>
          {items.map((item) => {
            const active = isNavActive(location.pathname, item.to, role);
            return (
              <Tooltip key={item.to} title={showLabels ? "" : t(item.label)} placement="right" disableHoverListener={showLabels}>
                <ListItemButton component={NavLink} to={item.to} selected={active} onClick={isMobile ? onCloseMobile : undefined}
                  sx={{ minHeight: 46, mb: 0.75, px: showLabels ? 1.5 : 1, justifyContent: showLabels ? "flex-start" : "center" }}>
                  <ListItemIcon sx={{ minWidth: showLabels ? 36 : 0, justifyContent: "center", color: active ? "#fff" : "text.secondary", "& svg": { fontSize: 22 } }}>{item.icon}</ListItemIcon>
                  {showLabels && <ListItemText primary={t(item.label)} primaryTypographyProps={{ fontWeight: active ? 600 : 500, fontSize: 14, noWrap: true }} />}
                  {showLabels && item.to === "/notifications" && unreadCount > 0 && <Chip label={unreadCount > 99 ? "99+" : unreadCount} size="small" color="error" sx={{ height: 20, fontSize: 11 }} />}
                </ListItemButton>
              </Tooltip>
            );
          })}
        </List>
      </Box>

      <Box sx={{ p: showLabels ? 2 : 1, borderTop: "1px solid", borderColor: "divider" }}>
        <Tooltip title={showLabels ? "" : t("auth.logout")} placement="right">
          <ListItemButton onClick={onLogout} sx={{ minHeight: 44, px: showLabels ? 1.5 : 1, justifyContent: showLabels ? "flex-start" : "center", color: "text.secondary" }}>
            <ListItemIcon sx={{ minWidth: showLabels ? 36 : 0, color: "inherit", justifyContent: "center" }}><LogoutIcon sx={{ fontSize: 22 }} /></ListItemIcon>
            {showLabels && <ListItemText primary={t("auth.logout")} primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }} />}
          </ListItemButton>
        </Tooltip>
      </Box>
    </>
  );

  return (
    <Drawer variant={isMobile ? "temporary" : "permanent"} open={isMobile ? mobileOpen : true} onClose={onCloseMobile} ModalProps={isMobile ? { keepMounted: true } : undefined}
      sx={{ width: isMobile ? undefined : width, flexShrink: 0, "& .MuiDrawer-paper": { width, maxWidth: isMobile ? "85vw" : undefined, boxSizing: "border-box", overflowX: "hidden", transition: (theme) => theme.transitions.create("width", { duration: 180 }) } }}>
      {content}
    </Drawer>
  );
}
