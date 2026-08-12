import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box,
  Chip,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";

import { isNavActive, navItemsFor } from "@/shared/navItems";
import { useListNotificationsQuery } from "@/features/notifications/notificationsApi";

export const SIDEBAR_WIDTH = 260;
/** Icons-only rail. Wide enough to keep a 40px target centred. */
export const SIDEBAR_COLLAPSED_WIDTH = 76;

interface Props {
  role: string;
  /** Desktop: rail vs full width. Toggled from the AppBar. */
  collapsed: boolean;
  /** Mobile: the temporary drawer's open state. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /** Below `md` the drawer floats over the content instead of reserving space. */
  isMobile: boolean;
  onLogout: () => void;
}

export default function Sidebar({
  role,
  collapsed,
  mobileOpen,
  onCloseMobile,
  isMobile,
  onLogout,
}: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const items = navItemsFor(role);

  // Shares the AppShell's cached query, so this adds no extra request.
  const { data: unread = [] } = useListNotificationsQuery({ unread_only: true, limit: 50 });
  const unreadCount = unread.length;

  // The rail only ever applies on desktop; inside the mobile drawer there is
  // room for labels, so it always renders expanded.
  const showLabels = isMobile || !collapsed;
  const width = showLabels ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  const content = (
    <>
      {/* Solid brand block, so the identity reads as a header rather than a
          row that happens to sit at the top of the list. */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: showLabels ? 2.5 : 0,
          py: 2.5,
          minHeight: 96,
          justifyContent: showLabels ? "flex-start" : "center",
          background: "linear-gradient(135deg, #1E3A8A 0%, #2547A8 100%)",
          color: "#fff",
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(255,255,255,.16)",
            border: "1px solid rgba(255,255,255,.28)",
            fontWeight: 800,
            fontSize: 19,
          }}
        >
          R
        </Box>
        {showLabels && (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={800} lineHeight={1.15} noWrap>
              ROYD
            </Typography>
            {/* Wraps to two lines rather than truncating — the second half
                names the operating principle and carries the meaning. */}
            <Typography
              variant="caption"
              sx={{ opacity: 0.82, display: "block", lineHeight: 1.25, fontSize: 11.5, whiteSpace: "pre-line" }}
            >
              {t("app.sidebarSubtitle")}
            </Typography>
          </Box>
        )}
      </Stack>

      <Box sx={{ p: showLabels ? 2 : 1, flexGrow: 1, overflowY: "auto", overflowX: "hidden" }}>
        {showLabels && (
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ px: 1.5, fontSize: 11, fontWeight: 600, letterSpacing: 0.8 }}
          >
            {t("nav.menu")}
          </Typography>
        )}
        <List sx={{ mt: 0.5 }}>
          {items.map((item) => {
            const active = isNavActive(location.pathname, item.to, role);
            return (
              <Tooltip
                key={item.to}
                title={showLabels ? "" : t(item.label)}
                placement="right"
                disableHoverListener={showLabels}
              >
                <ListItemButton
                  component={NavLink}
                  to={item.to}
                  selected={active}
                  // Tapping a link on mobile must dismiss the overlay, or the
                  // student lands on the new page with the menu still covering it.
                  onClick={isMobile ? onCloseMobile : undefined}
                  sx={{
                    minHeight: 48,
                    justifyContent: showLabels ? "flex-start" : "center",
                    px: showLabels ? 2 : 1.5,
                    // A left bar marks the active row, so the current page is
                    // legible even where the tint is subtle.
                    "&.Mui-selected": {
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        left: 0,
                        top: 8,
                        bottom: 8,
                        width: 3,
                        borderRadius: 3,
                        bgcolor: "primary.main",
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: showLabels ? 40 : 0,
                      justifyContent: "center",
                      color: active ? "primary.main" : "text.secondary",
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {showLabels && (
                    <ListItemText
                      primary={t(item.label)}
                      primaryTypographyProps={{
                        fontWeight: active ? 700 : 500,
                        noWrap: true,
                        fontSize: 15,
                      }}
                    />
                  )}
                  {/* Unread counter, mirroring the badge in the header. */}
                  {showLabels && item.to === "/notifications" && unreadCount > 0 && (
                    <Chip
                      label={unreadCount > 99 ? "99+" : unreadCount}
                      size="small"
                      color="error"
                      sx={{ height: 20, minWidth: 20, fontSize: 11, fontWeight: 700 }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            );
          })}
        </List>
      </Box>

      {/* Logout closes the session, so it is kept apart from navigation. */}
      <Box sx={{ p: showLabels ? 2 : 1, borderTop: "1px solid", borderColor: "divider" }}>
        <Tooltip title={showLabels ? "" : t("auth.logout")} placement="right">
          <ListItemButton
            onClick={onLogout}
            sx={{
              minHeight: 48,
              borderRadius: 2,
              justifyContent: showLabels ? "flex-start" : "center",
              px: showLabels ? 2 : 1.5,
              color: "error.main",
              "&:hover": { bgcolor: "rgba(239,68,68,0.08)" },
            }}
          >
            <ListItemIcon
              sx={{ minWidth: showLabels ? 40 : 0, justifyContent: "center", color: "error.main" }}
            >
              <LogoutIcon />
            </ListItemIcon>
            {showLabels && (
              <ListItemText
                primary={t("auth.logout")}
                primaryTypographyProps={{ fontWeight: 600, noWrap: true, fontSize: 15 }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </Box>
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onCloseMobile}
        // Keeps the menu in the DOM so opening it is instant on a phone.
        ModalProps={{ keepMounted: true }}
        sx={{
          "& .MuiDrawer-paper": {
            width: SIDEBAR_WIDTH,
            maxWidth: "85vw",
            boxSizing: "border-box",
            backgroundColor: "#FFFFFF",
          },
        }}
      >
        {content}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        whiteSpace: "nowrap",
        transition: (theme) =>
          theme.transitions.create("width", {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        "& .MuiDrawer-paper": {
          width,
          boxSizing: "border-box",
          backgroundColor: "#FFFFFF",
          overflowX: "hidden",
          transition: (theme) =>
            theme.transitions.create("width", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
        },
      }}
    >
      {content}
    </Drawer>
  );
}
