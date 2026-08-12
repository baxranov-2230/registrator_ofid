import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import InboxIcon from "@mui/icons-material/MoveToInbox";
import HourglassIcon from "@mui/icons-material/HourglassEmpty";
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline";
import WarningIcon from "@mui/icons-material/WarningAmber";
import PeopleIcon from "@mui/icons-material/PeopleAltOutlined";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import SpeedIcon from "@mui/icons-material/SpeedOutlined";

import type { AuthUser } from "@/features/auth/authSlice";
import { formatApiError } from "@/shared/api/errors";
import { requestPathForRole } from "@/shared/navigation";
import { useGetDashboardStatsQuery } from "@/features/home/statsApi";
import { useListRequestsQuery } from "@/features/requests/requestsApi";
import { STATUS_COLOR } from "@/features/requests/statusMeta";
import { StatTile, SectionHeader } from "@/features/home/DashboardParts";

/** Where each role's "see everything" list lives. */
const LIST_PATH: Record<string, string> = {
  registrator: "/registrator/inbox",
  staff: "/staff/queue",
  admin: "/admin/requests",
  leadership: "/admin/requests",
};

/**
 * Operational dashboard for every non-student role.
 *
 * Shares the student page's visual language, but answers a different question:
 * not "where is my request?" but "what needs my attention now?". The counters
 * are therefore queue-shaped and each one deep-links into a filtered list.
 */
export default function StaffDashboard({ user }: { user: AuthUser }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const role = user.role.name;
  const { data: stats, isLoading, error } = useGetDashboardStatsQuery();
  const { data: recent, isLoading: recentLoading } = useListRequestsQuery({ limit: 6 });

  const firstName = user.full_name?.split(" ")[0] || "";
  const listPath = LIST_PATH[role] ?? "/admin/requests";
  const detailBase = requestPathForRole(role);
  const isOversight = role === "admin" || role === "leadership";

  const tiles = isOversight
    ? [
        {
          label: t("dashboard.stats.totalUsers"),
          value: stats?.total_users ?? 0,
          hint: t("dashboard.stats.total"),
          icon: <PeopleIcon />,
          color: "#6366F1",
          onClick: role === "admin" ? () => navigate("/admin/users") : undefined,
        },
        {
          label: t("dashboard.stats.activeRequests"),
          value: stats?.open ?? 0,
          hint: t("dashboard.stats.total"),
          icon: <DescriptionIcon />,
          color: "#3B82F6",
          onClick: () => navigate(listPath),
        },
        {
          label: t("dashboard.stats.completedToday"),
          value: stats?.completed_today ?? 0,
          hint: t("dashboard.stats.total"),
          icon: <CheckCircleIcon />,
          color: "#10B981",
        },
        {
          label: t("dashboard.stats.slaBreaches"),
          value: stats?.overdue ?? 0,
          hint: t("dashboard.stats.unassigned", { count: stats?.unassigned ?? 0 }),
          icon: <WarningIcon />,
          color: "#EF4444",
          onClick: () => navigate(listPath),
        },
      ]
    : [
        {
          label: t("dashboard.stats.incoming"),
          value: stats?.by_status?.new ?? 0,
          hint: t("dashboard.stats.total"),
          icon: <InboxIcon />,
          color: "#3B82F6",
          onClick: () => navigate(listPath),
        },
        {
          label: t("requests.status.in_progress"),
          value: stats?.by_status?.in_progress ?? 0,
          hint: t("dashboard.stats.total"),
          icon: <HourglassIcon />,
          color: "#F59E0B",
          onClick: () => navigate(listPath),
        },
        {
          label: t("dashboard.stats.completedToday"),
          value: stats?.completed_today ?? 0,
          hint: t("dashboard.stats.total"),
          icon: <CheckCircleIcon />,
          color: "#10B981",
        },
        {
          label: t("dashboard.stats.slaRisk"),
          value: stats?.overdue ?? 0,
          hint: t("dashboard.stats.dueSoon", { count: stats?.due_soon ?? 0 }),
          icon: <WarningIcon />,
          color: "#EF4444",
          onClick: () => navigate(listPath),
        },
      ];

  const sla = stats?.sla_compliance_pct ?? null;

  return (
    <Box sx={{ width: "100%" }}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Card
        sx={{
          mb: 3,
          background: "linear-gradient(120deg, #F5F8FF 0%, #FFFFFF 55%)",
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{ p: { xs: 2.5, md: 3.5 } }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: 2.5,
              display: { xs: "none", sm: "grid" },
              placeItems: "center",
              color: "#fff",
              background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
            }}
          >
            <SpeedIcon />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1 }}>
              {t(`role.${role}`).toUpperCase()}
            </Typography>
            <Typography
              variant="h4"
              fontWeight={800}
              sx={{ letterSpacing: "-0.02em", fontSize: { xs: "1.5rem", md: "2rem" } }}
            >
              {t("dashboard.greeting", { name: firstName })}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("dashboard.subtitle")}
            </Typography>
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
          gridTemplateColumns: { xs: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
        }}
      >
        {tiles.map((tile) => (
          <StatTile key={tile.label} loading={isLoading} {...tile} />
        ))}
      </Box>

      {/* ── Queue + performance ──────────────────────────────────────── */}
      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 2fr) minmax(0, 1fr)" },
          alignItems: "start",
        }}
      >
        <Card>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <SectionHeader
              title={t("dashboard.recentActivity")}
              actionLabel={t("common.viewAll")}
              onAction={() => navigate(listPath)}
            />

            {recentLoading && (
              <Stack spacing={1}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} variant="rounded" height={56} />
                ))}
              </Stack>
            )}

            {!recentLoading && (recent?.items.length ?? 0) === 0 && (
              <Box
                sx={{
                  py: 6,
                  textAlign: "center",
                  border: "2px dashed",
                  borderColor: "divider",
                  borderRadius: 3,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {t("dashboard.noActivity")}
                </Typography>
              </Box>
            )}

            <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
              {recent?.items.map((r) => (
                <ButtonBase
                  key={r.id}
                  onClick={() => navigate(`${detailBase}/${r.id}`)}
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
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, width: "100%" }}>
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
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ flexShrink: 0, pl: { xs: 6.5, sm: 0 } }}>
                    {r.is_overdue && (
                      <Chip
                        size="small"
                        color="error"
                        variant="outlined"
                        label={t("requests.overdue")}
                        sx={{ flexShrink: 0 }}
                      />
                    )}
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
                  </Stack>
                </ButtonBase>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1rem", sm: "1.25rem" }, mb: 2 }}>
              {t("dashboard.performance")}
            </Typography>

            <Stack spacing={2.5}>
              {sla !== null && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" mb={0.75}>
                    <Typography variant="body2" color="text.secondary">
                      {t("dashboard.stats.slaCompliance")}
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {sla.toFixed(0)}%
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, Math.max(0, sla))}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: "rgba(15,23,42,.06)",
                      "& .MuiLinearProgress-bar": {
                        borderRadius: 4,
                        // Compliance is a health signal, so the colour has to
                        // track the value rather than stay brand-indigo.
                        bgcolor: sla >= 90 ? "#10B981" : sla >= 70 ? "#F59E0B" : "#EF4444",
                      },
                    }}
                  />
                </Box>
              )}

              <MetricRow
                label={t("dashboard.stats.avgResolution")}
                value={
                  stats?.avg_resolution_hours != null
                    ? t("dashboard.stats.hours", {
                        count: Math.round(stats.avg_resolution_hours),
                      })
                    : "—"
                }
              />
              <MetricRow
                label={t("dashboard.stats.createdThisWeek")}
                value={String(stats?.created_this_week ?? 0)}
              />
              <MetricRow
                label={t("dashboard.stats.dueSoonLabel")}
                value={String(stats?.due_soon ?? 0)}
              />
              {isOversight && (
                <MetricRow
                  label={t("requests.unassignedOnly")}
                  value={String(stats?.unassigned ?? 0)}
                />
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} textAlign="right">
        {value}
      </Typography>
    </Stack>
  );
}
