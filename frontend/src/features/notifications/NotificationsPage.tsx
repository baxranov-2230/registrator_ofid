import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  List,
  ListItemButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AssignmentIcon from "@mui/icons-material/Assignment";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";

import type { RootState } from "@/app/store";
import { requestPathForRole } from "@/shared/navigation";
import {
  NotificationType,
  useListNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from "@/features/notifications/notificationsApi";

const ICONS: Record<NotificationType, React.ReactNode> = {
  request_created: <AssignmentIcon fontSize="small" />,
  request_assigned: <AssignmentIcon fontSize="small" />,
  request_status: <SwapHorizIcon fontSize="small" />,
  request_message: <ChatBubbleOutlineIcon fontSize="small" />,
  system: <InfoOutlinedIcon fontSize="small" />,
};

function relativeTime(iso: string, t: TFunction): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  return t("time.daysAgo", { count: Math.floor(hours / 24) });
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useSelector((s: RootState) => s.auth.user?.role.name);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data = [], isLoading } = useListNotificationsQuery({
    unread_only: filter === "unread",
    limit: 100,
  });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, allState] = useMarkAllNotificationsReadMutation();

  const unreadCount = data.filter((n) => !n.is_read).length;

  const open = async (id: number, isRead: boolean, requestId?: number) => {
    if (!isRead) await markRead(id);
    if (requestId && role) navigate(`${requestPathForRole(role)}/${requestId}`);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {t("nav.notifications")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("notifications.subtitle", { count: unreadCount })}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filter}
            onChange={(_e, v) => v && setFilter(v)}
          >
            <ToggleButton value="all">{t("notifications.all")}</ToggleButton>
            <ToggleButton value="unread">{t("notifications.unread")}</ToggleButton>
          </ToggleButtonGroup>
          <Button
            startIcon={<DoneAllIcon />}
            onClick={() => markAllRead()}
            disabled={unreadCount === 0 || allState.isLoading}
          >
            {t("notifications.markAllRead")}
          </Button>
        </Stack>
      </Stack>

      <Card>
        <CardContent sx={{ p: 0 }}>
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : data.length === 0 ? (
            <Box sx={{ py: 8, textAlign: "center" }}>
              <Typography color="text.secondary">{t("notifications.empty")}</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {data.map((n) => (
                <ListItemButton
                  key={n.id}
                  onClick={() => open(n.id, n.is_read, n.payload?.request_id)}
                  sx={{
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    bgcolor: n.is_read ? "transparent" : "action.hover",
                    alignItems: "flex-start",
                    gap: 2,
                    py: 2,
                  }}
                >
                  <Box
                    sx={{
                      mt: 0.25,
                      width: 34,
                      height: 34,
                      borderRadius: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: n.is_read ? "action.selected" : "primary.main",
                      color: n.is_read ? "text.secondary" : "primary.contrastText",
                      flexShrink: 0,
                    }}
                  >
                    {ICONS[n.type] ?? ICONS.system}
                  </Box>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2" fontWeight={n.is_read ? 500 : 700} noWrap>
                        {n.title}
                      </Typography>
                      {n.payload?.tracking_no && (
                        <Chip label={String(n.payload.tracking_no)} size="small" />
                      )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {n.body}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                    {relativeTime(n.created_at, t)}
                  </Typography>
                </ListItemButton>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
