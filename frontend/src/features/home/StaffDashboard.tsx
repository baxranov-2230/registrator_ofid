import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Card, CardContent, CardHeader, Chip, LinearProgress, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import InboxIcon from "@mui/icons-material/MoveToInboxOutlined";
import HourglassIcon from "@mui/icons-material/HourglassEmpty";
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline";
import WarningIcon from "@mui/icons-material/WarningAmber";
import PeopleIcon from "@mui/icons-material/PeopleAltOutlined";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import CalendarIcon from "@mui/icons-material/CalendarMonthOutlined";

import type { AuthUser } from "@/features/auth/authSlice";
import { designColors } from "@/app/theme";
import { formatApiError } from "@/shared/api/errors";
import { requestPathForRole } from "@/shared/navigation";
import { useGetDashboardStatsQuery } from "@/features/home/statsApi";
import { useListRequestsQuery } from "@/features/requests/requestsApi";
import { STATUS_COLOR, STATUS_ORDER } from "@/features/requests/statusMeta";
import { StatTile, SectionHeader } from "@/features/home/DashboardParts";

const LIST_PATH: Record<string, string> = {
  registrator: "/registrator/inbox", staff: "/staff/queue", admin: "/admin/requests", leadership: "/admin/requests",
};

export default function StaffDashboard({ user }: { user: AuthUser }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const role = user.role.name;
  const { data: stats, isLoading, error } = useGetDashboardStatsQuery();
  const { data: recent, isLoading: recentLoading, error: recentError } = useListRequestsQuery({ limit: 6 });
  const listPath = LIST_PATH[role] ?? "/admin/requests";
  const detailBase = requestPathForRole(role);
  const isOversight = role === "admin" || role === "leadership";
  const locale = i18n.language.startsWith("ru") ? "ru-RU" : "uz-UZ";
  const sla = stats?.sla_compliance_pct ?? null;
  const statusTotal = STATUS_ORDER.reduce((sum, status) => sum + (stats?.by_status[status] ?? 0), 0);
  const openList = () => navigate(listPath);
  const tiles = [
    { label: t("dashboard.totalRequests"), value: stats?.total ?? null, hint: t("dashboard.allTime"), icon: <DescriptionIcon />, color: designColors.orange, onClick: openList },
    { label: t(isOversight ? "dashboard.stats.totalUsers" : "dashboard.stats.incoming"), value: (isOversight ? stats?.total_users : stats?.by_status.new) ?? null, hint: t("dashboard.stats.total"), icon: isOversight ? <PeopleIcon /> : <InboxIcon />, color: designColors.blue, onClick: role === "admin" ? () => navigate("/admin/users") : isOversight ? undefined : openList },
    { label: t("dashboard.stats.activeRequests"), value: stats?.open ?? null, hint: t("dashboard.inQueue"), icon: <HourglassIcon />, color: designColors.purple, onClick: openList },
    { label: t("dashboard.stats.createdThisWeek"), value: stats?.created_this_week ?? null, hint: t("dashboard.thisWeek"), icon: <CalendarIcon />, color: designColors.primary, onClick: openList },
    { label: t("dashboard.stats.completedToday"), value: stats?.completed_today ?? null, hint: t("dashboard.today"), icon: <CheckCircleIcon />, color: designColors.green },
    { label: t("dashboard.stats.slaBreaches"), value: stats?.overdue ?? null, hint: t("dashboard.stats.dueSoon", { count: stats?.due_soon ?? 0 }), icon: <WarningIcon />, color: designColors.cyan, onClick: openList },
  ];

  return (
    <Box sx={{ width: "100%" }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4">{t("nav.dashboard")}</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>{t("dashboard.greeting", { name: user.full_name.split(" ")[0] })} {t("dashboard.overviewSubtitle")}</Typography>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "text.secondary", flexShrink: 0 }}>
          <CalendarIcon sx={{ fontSize: 18 }} /><Typography variant="caption">{new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}</Typography>
        </Stack>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 3 }}>{formatApiError(error, t("dashboard.statsError"))}</Alert>}

      <Box sx={{ display: "grid", gap: 3, mb: 3, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 2fr) minmax(280px, 1fr)" } }}>
        <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, "@media (min-width: 380px) and (max-width: 599px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } }}>
          {tiles.map((tile) => <StatTile key={tile.label} loading={isLoading} {...tile} />)}
        </Box>
        <Card>
          <CardHeader title={t("dashboard.statusOverview")} />
          <CardContent>
            {isLoading ? <Stack spacing={2}>{[0, 1, 2, 3].map((n) => <Skeleton key={n} height={40} />)}</Stack> : !stats ? <Typography color="text.secondary">—</Typography> : <>
              <Box aria-hidden sx={{ display: "flex", gap: 0.5, height: 38, mb: 2.5 }}>
                {statusTotal > 0 ? STATUS_ORDER.filter((status) => stats.by_status[status] > 0).map((status) => <Box key={status} sx={{ flex: stats.by_status[status], minWidth: 4, bgcolor: STATUS_COLOR[status], borderRadius: "5px" }} />) : <Box sx={{ flex: 1, bgcolor: "background.default", borderRadius: "5px" }} />}
              </Box>
              <Stack spacing={1.5}>
                {STATUS_ORDER.map((status) => <Stack key={status} direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: STATUS_COLOR[status], flexShrink: 0 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{t(`requests.status.${status}`)}</Typography>
                  <Typography variant="body2" fontWeight={600}>{stats.by_status[status] ?? 0}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ width: 40, textAlign: "right" }}>{statusTotal ? Math.round((stats.by_status[status] ?? 0) / statusTotal * 100) : 0}%</Typography>
                </Stack>)}
              </Stack>
            </>}
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 2fr) minmax(280px, 1fr)" }, alignItems: "start" }}>
        <Card sx={{ minWidth: 0 }}>
          <SectionHeader title={t("dashboard.recentActivity")} actionLabel={t("common.viewAll")} onAction={openList} />
          {recentError ? <Box sx={{ p: 2.5 }}><Alert severity="error">{formatApiError(recentError, t("common.error"))}</Alert></Box> : <TableContainer sx={{ boxShadow: "none", borderRadius: 0 }}>
            <Table size="small" aria-label={t("dashboard.recentActivity")}>
              <TableHead><TableRow><TableCell>{t("requests.title")}</TableCell><TableCell>{t("requests.statusLabel")}</TableCell><TableCell align="right">{t("requests.createdAt")}</TableCell></TableRow></TableHead>
              <TableBody>
                {recentLoading && [0, 1, 2, 3].map((n) => <TableRow key={n}><TableCell colSpan={3}><Skeleton height={36} /></TableCell></TableRow>)}
                {!recentLoading && !recent?.items.length && <TableRow><TableCell colSpan={3} align="center" sx={{ py: 6 }}>{t("dashboard.noActivity")}</TableCell></TableRow>}
                {recent?.items.map((request) => <TableRow key={request.id} hover>
                  <TableCell>
                    <Box component="button" onClick={() => navigate(`${detailBase}/${request.id}`)} sx={{ border: 0, background: "none", p: 0, cursor: "pointer", textAlign: "left", color: "text.primary", font: "inherit", "&:hover": { color: "primary.main" } }}>
                      <Typography variant="body2" fontWeight={500} sx={{ minWidth: 150 }}>{request.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{request.tracking_no}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell><Stack spacing={0.5} alignItems="flex-start"><Chip size="small" label={t(`requests.status.${request.status}`)} sx={{ bgcolor: `${STATUS_COLOR[request.status]}15`, color: STATUS_COLOR[request.status] }} />{request.is_overdue && <Typography variant="caption" color="error.main">{t("requests.overdue")}</Typography>}</Stack></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>{new Date(request.created_at).toLocaleDateString(locale)}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </TableContainer>}
        </Card>
        <Card>
          <CardHeader title={t("dashboard.performance")} />
          <CardContent>
            {isLoading ? <Stack spacing={2}>{[0, 1, 2].map((n) => <Skeleton key={n} height={42} />)}</Stack> : <Stack spacing={2.5}>
              <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: "8px" }}>
                <Typography variant="body2" color="text.secondary">{t("dashboard.stats.slaCompliance")}</Typography>
                <Typography variant="h3" sx={{ my: 1 }}>{sla === null ? "—" : `${sla.toFixed(0)}%`}</Typography>
                {sla !== null && <LinearProgress aria-label={t("dashboard.stats.slaCompliance")} variant="determinate" value={Math.max(0, Math.min(100, sla))} color={sla >= 90 ? "primary" : sla >= 70 ? "warning" : "error"} />}
              </Box>
              <MetricRow label={t("dashboard.stats.avgResolution")} value={stats?.avg_resolution_hours != null ? t("dashboard.stats.hours", { count: Math.round(stats.avg_resolution_hours) }) : "—"} />
              <MetricRow label={t("dashboard.stats.dueSoonLabel")} value={stats ? String(stats.due_soon) : "—"} />
              {isOversight && <MetricRow label={t("requests.unassignedOnly")} value={stats ? String(stats.unassigned ?? 0) : "—"} />}
            </Stack>}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={600} textAlign="right">{value}</Typography></Stack>;
}
