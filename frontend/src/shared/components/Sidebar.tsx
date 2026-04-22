import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
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
import BarChartIcon from "@mui/icons-material/BarChartOutlined";

export const SIDEBAR_WIDTH = 260;

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  student: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.myRequests", to: "/student/requests", icon: <AssignmentIcon /> },
    { label: "nav.newRequest", to: "/student/requests/new", icon: <AddCircleIcon /> },
  ],
  registrator: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.inbox", to: "/registrator/inbox", icon: <InboxIcon /> },
  ],
  staff: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.queue", to: "/staff/queue", icon: <QueueIcon /> },
  ],
  admin: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.users", to: "/admin/users", icon: <PeopleIcon /> },
    { label: "nav.faculties", to: "/admin/faculties", icon: <SchoolIcon /> },
    { label: "nav.groups", to: "/admin/groups", icon: <GroupsIcon /> },
    { label: "nav.categories", to: "/admin/categories", icon: <CategoryIcon /> },
    { label: "nav.audit", to: "/admin/audit", icon: <HistoryIcon /> },
  ],
  leadership: [
    { label: "nav.dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "nav.analytics", to: "/leadership/analytics", icon: <BarChartIcon /> },
    { label: "nav.audit", to: "/admin/audit", icon: <HistoryIcon /> },
  ],
};

export default function Sidebar({ role }: { role: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const items = NAV_BY_ROLE[role] || [];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: SIDEBAR_WIDTH,
          boxSizing: "border-box",
          backgroundColor: "#FFFFFF",
        },
      }}
    >
      <Stack spacing={0.5} sx={{ px: 3, py: 3, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2,
              background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 800,
              fontSize: 18,
            }}
          >
            R
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
              ROYD
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Registrator Ofis
            </Typography>
          </Box>
        </Box>
      </Stack>

      <Box sx={{ p: 2, flexGrow: 1 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ px: 1.5, fontSize: 11, fontWeight: 600, letterSpacing: 0.8 }}
        >
          {t("nav.menu")}
        </Typography>
        <List sx={{ mt: 0.5 }}>
          {items.map((item) => {
            const isActive =
              location.pathname === item.to ||
              (item.to !== "/dashboard" && location.pathname.startsWith(item.to));
            return (
              <ListItemButton
                key={item.to}
                component={NavLink}
                to={item.to}
                selected={isActive}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={t(item.label)} primaryTypographyProps={{ fontWeight: 500 }} />
              </ListItemButton>
            );
          })}
        </List>
      </Box>
    </Drawer>
  );
}
