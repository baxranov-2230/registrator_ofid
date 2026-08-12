import type { ReactNode } from "react";
import SchoolIcon from "@mui/icons-material/SchoolOutlined";
import DescriptionIcon from "@mui/icons-material/Description";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import EventIcon from "@mui/icons-material/CalendarMonth";
import ForumIcon from "@mui/icons-material/ChatBubbleOutline";

/**
 * Tile styling for the dashboard's service-type shortcuts.
 *
 * Indexed by position rather than by name: the catalogue is admin-editable, so
 * keying on a title would silently lose its colour the moment someone renames a
 * service type.
 */
export const SERVICE_TYPE_ICONS: {
  icon: ReactNode;
  color: string;
  bg: string;
}[] = [
  { icon: <SchoolIcon />, color: "#2563EB", bg: "#EFF6FF" },
  { icon: <DescriptionIcon />, color: "#16A34A", bg: "#F0FDF4" },
  { icon: <SwapHorizIcon />, color: "#7C3AED", bg: "#F5F3FF" },
  { icon: <EventIcon />, color: "#EA580C", bg: "#FFF7ED" },
  { icon: <ForumIcon />, color: "#0891B2", bg: "#ECFEFF" },
];
