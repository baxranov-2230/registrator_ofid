import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassIcon from "@mui/icons-material/HourglassEmpty";
import CancelIcon from "@mui/icons-material/HighlightOff";
import NotificationsIcon from "@mui/icons-material/NotificationsNoneOutlined";
import InfoIcon from "@mui/icons-material/InfoOutlined";

import type { AuthUser } from "@/features/auth/authSlice";
import { formatApiError } from "@/shared/api/errors";
import { useGetDashboardStatsQuery } from "@/features/home/statsApi";
import { useListCategoriesQuery } from "@/features/admin/adminApi";
import { useListRequestsQuery } from "@/features/requests/requestsApi";
import { useListNotificationsQuery } from "@/features/notifications/notificationsApi";
import { STATUS_COLOR } from "@/features/requests/statusMeta";
import CampusIllustration from "@/features/home/CampusIllustration";
import { SectionHeader, StatTile } from "@/features/home/DashboardParts";
import { SERVICE_TYPE_ICONS } from "@/features/home/serviceTypeIcons";

export default function StudentDashboard({ user }: { user: AuthUser }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: stats, isLoading, error } = useGetDashboardStatsQuery();
  const { data: recent, isLoading: recentLoading } = useListRequestsQuery({ limit: 3 });
  const { data: catTree = [] } = useListCategoriesQuery();
  const { data: notifications = [] } = useListNotificationsQuery({ limit: 3 });

  const firstName = user.full_name?.split(" ")[0] || "";

  // The six service types are the roots of the catalogue tree.
  const serviceTypes = useMemo(
    () => catTree.filter((n) => n.is_active).slice(0, 5),
    [catTree],
  );

  const tiles = [
    {
      label: t("dashboard.stats.myRequests"),
      value: stats?.total ?? 0,
      hint: t("dashboard.stats.total"),
      icon: <DescriptionIcon />,
      color: "#3B82F6",
      onClick: () => navigate("/student/requests"),
    },
    {
      label: t("requests.status.completed"),
      value: stats?.by_status?.completed ?? 0,
      hint: t("dashboard.stats.total"),
      icon: <CheckCircleIcon />,
      color: "#10B981",
    },
    {
      label: t("requests.status.in_progress"),
      value: stats?.open ?? 0,
      hint: t("dashboard.stats.total"),
      icon: <HourglassIcon />,
      color: "#F59E0B",
    },
    {
      label: t("requests.status.rejected"),
      value: stats?.by_status?.rejected ?? 0,
      hint: t("dashboard.stats.total"),
      icon: <CancelIcon />,
      color: "#EF4444",
    },
  ];

  return (
    <Box>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Card
        sx={{
          mb: 3,
          overflow: "hidden",
          background: "linear-gradient(120deg, #F5F8FF 0%, #FFFFFF 55%)",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          alignItems={{ md: "center" }}
          justifyContent="space-between"
          spacing={2}
          sx={{ p: { xs: 2.5, md: 4 }, pb: { xs: 0, md: 4 } }}
        >
          <Box sx={{ minWidth: 0, maxWidth: { md: 520 } }}>
            <Typography
              variant="h4"
              fontWeight={800}
              sx={{ letterSpacing: "-0.02em", fontSize: { xs: "1.5rem", md: "2rem" } }}
            >
              {t("dashboard.greeting", { name: firstName })}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t("dashboard.heroSubtitle")}
            </Typography>
          </Box>

          {/* Ornamental, so it is the first thing to go on a narrow screen. */}
          <Box
            sx={{
              display: { xs: "none", sm: "block" },
              width: { sm: "70%", md: 420 },
              flexShrink: 0,
              alignSelf: "flex-end",
            }}
          >
            <CampusIllustration />
          </Box>
        </Stack>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {formatApiError(error, t("dashboard.statsError"))}
        </Alert>
      )}

      {/* ── Counters ─────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "grid",
          gap: 2,
          mb: 3,
          gridTemplateColumns: {
            xs: "repeat(2, 1fr)",
            lg: "repeat(4, 1fr)",
          },
        }}
      >
        {tiles.map((tile) => (
          <StatTile key={tile.label} loading={isLoading} {...tile} />
        ))}
      </Box>

      {/* ── Service catalogue ────────────────────────────────────────── */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <SectionHeader
            title={t("dashboard.serviceCatalog")}
            actionLabel={t("common.viewAll")}
            onAction={() => navigate("/student/requests/new")}
          />
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
                lg: "repeat(5, 1fr)",
              },
            }}
          >
            {serviceTypes.length === 0 &&
              [0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="rounded" height={132} sx={{ borderRadius: 3 }} />
              ))}

            {serviceTypes.map((type, i) => {
              const meta = SERVICE_TYPE_ICONS[i % SERVICE_TYPE_ICONS.length];
              const count = type.children.filter((c) => c.is_active).length;
              return (
                <ButtonBase
                  key={type.id}
                  // Deep-links into the new-request form with the type chosen,
                  // so the card is a real shortcut rather than decoration.
                  onClick={() =>
                    navigate(`/student/requests/new?type=${type.id}`)
                  }
                  sx={{
                    display: "block",
                    textAlign: "center",
                    p: 2,
                    borderRadius: 3,
                    height: "100%",
                    bgcolor: meta.bg,
                    border: "1px solid transparent",
                    transition: "transform .15s, box-shadow .15s, border-color .15s",
                    "&:hover": {
                      transform: "translateY(-3px)",
                      borderColor: meta.color,
                      boxShadow: `0 8px 20px ${meta.color}22`,
                    },
                    "&.Mui-focusVisible": {
                      outline: "2px solid",
                      outlineColor: meta.color,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Box sx={{ color: meta.color, mb: 1, "& svg": { fontSize: 34 } }}>
                    {meta.icon}
                  </Box>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    sx={{ lineHeight: 1.3, overflowWrap: "anywhere" }}
                  >
                    {type.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mt: 0.5 }}
                  >
                    {t("requests.serviceCount", { count })}
                  </Typography>
                </ButtonBase>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      {/* ── Requests + notifications ─────────────────────────────────── */}
      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          alignItems: "start",
        }}
      >
        <Card>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <SectionHeader
              title={t("requests.myTitle")}
              actionLabel={t("common.viewAll")}
              onAction={() => navigate("/student/requests")}
            />

            {recentLoading && <Skeleton height={64} />}

            {!recentLoading && (recent?.items.length ?? 0) === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                {t("requests.noRequests")}
              </Typography>
            )}

            <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
              {recent?.items.map((r) => (
                <ButtonBase
                  key={r.id}
                  onClick={() => navigate(`/student/requests/${r.id}`)}
                  sx={{
                    display: "block",
                    textAlign: "left",
                    width: "100%",
                    px: 1,
                    py: 1.5,
                    borderRadius: 2,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 38,
                        height: 38,
                        flexShrink: 0,
                        borderRadius: 2,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: `${STATUS_COLOR[r.status]}14`,
                        color: STATUS_COLOR[r.status],
                      }}
                    >
                      <DescriptionIcon fontSize="small" />
                    </Box>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {r.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {r.tracking_no} · {new Date(r.created_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={t(`requests.status.${r.status}`)}
                      sx={{
                        flexShrink: 0,
                        fontWeight: 600,
                        bgcolor: `${STATUS_COLOR[r.status]}18`,
                        color: STATUS_COLOR[r.status],
                      }}
                    />
                  </Stack>
                </ButtonBase>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <SectionHeader
              title={t("nav.notifications")}
              actionLabel={t("common.viewAll")}
              onAction={() => navigate("/notifications")}
            />

            {notifications.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                {t("notifications.empty")}
              </Typography>
            )}

            <Stack spacing={0.5}>
              {notifications.slice(0, 3).map((n) => (
                <Stack
                  key={n.id}
                  direction="row"
                  spacing={1.5}
                  alignItems="flex-start"
                  sx={{ px: 1, py: 1.5 }}
                >
                  <Box
                    sx={{
                      mt: 0.25,
                      color: n.is_read ? "text.disabled" : "primary.main",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    {n.type === "request_status" ? (
                      <CheckCircleIcon fontSize="small" />
                    ) : n.type === "request_message" ? (
                      <InfoIcon fontSize="small" />
                    ) : (
                      <NotificationsIcon fontSize="small" />
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                      {n.title}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {new Date(n.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
