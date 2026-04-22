import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import type { RootState } from "@/app/store";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  hint?: string;
  trend?: { value: string; positive: boolean };
}

function StatCard({ title, value, icon, color, hint, trend }: StatCardProps) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: `${color}15`,
              color,
            }}
          >
            {icon}
          </Box>
          {trend && (
            <Chip
              size="small"
              icon={<TrendingUpIcon sx={{ fontSize: 14 }} />}
              label={trend.value}
              sx={{
                bgcolor: trend.positive ? "#10B98115" : "#EF444415",
                color: trend.positive ? "#10B981" : "#EF4444",
                height: 24,
              }}
            />
          )}
        </Stack>
        <Typography variant="h4" fontWeight={700} mb={0.5}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.disabled" display="block" mt={1}>
            {hint}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSelector((s: RootState) => s.auth.user);

  if (!user) return null;

  const role = user.role.name;
  const firstName = user.full_name?.split(" ")[0] || "";

  return (
    <Box>
      {/* Hero / Greeting */}
      <Paper
        sx={{
          p: { xs: 3, md: 4 },
          mb: 3,
          background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
          color: "white",
          border: "none",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            right: -40,
            top: -40,
            width: 200,
            height: 200,
            borderRadius: "50%",
            bgcolor: "rgba(255,255,255,0.08)",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            right: 60,
            bottom: -60,
            width: 140,
            height: 140,
            borderRadius: "50%",
            bgcolor: "rgba(255,255,255,0.05)",
          }}
        />
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} spacing={2}>
          <Box sx={{ flexGrow: 1, position: "relative" }}>
            <Typography variant="overline" sx={{ opacity: 0.8, letterSpacing: 1 }}>
              {t(`role.${role}`)}
            </Typography>
            <Typography variant="h4" fontWeight={700} mt={0.5}>
              {t("dashboard.greeting", { name: firstName })}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 0.5 }}>
              {t("dashboard.subtitle")}
            </Typography>
          </Box>
          {role === "student" && (
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={() => navigate("/student/requests/new")}
              sx={{
                bgcolor: "white",
                color: "primary.main",
                "&:hover": { bgcolor: "#F1F5F9" },
              }}
            >
              {t("nav.newRequest")}
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Stats */}
      <Grid container spacing={3} mb={3}>
        {role === "student" && (
          <>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.myRequests")}
                value={0}
                icon={<AssignmentIcon />}
                color="#4F46E5"
                hint={t("dashboard.stats.total")}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.inProgress")}
                value={0}
                icon={<AccessTimeIcon />}
                color="#F59E0B"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.completed")}
                value={0}
                icon={<CheckCircleIcon />}
                color="#10B981"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.overdue")}
                value={0}
                icon={<WarningAmberIcon />}
                color="#EF4444"
              />
            </Grid>
          </>
        )}

        {(role === "registrator" || role === "staff") && (
          <>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.incoming")}
                value={0}
                icon={<AssignmentIcon />}
                color="#4F46E5"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.inProgress")}
                value={0}
                icon={<AccessTimeIcon />}
                color="#F59E0B"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.completedToday")}
                value={0}
                icon={<CheckCircleIcon />}
                color="#10B981"
                trend={{ value: "+12%", positive: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.slaRisk")}
                value={0}
                icon={<WarningAmberIcon />}
                color="#EF4444"
              />
            </Grid>
          </>
        )}

        {(role === "admin" || role === "leadership") && (
          <>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.totalUsers")}
                value={0}
                icon={<PeopleAltIcon />}
                color="#4F46E5"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.activeRequests")}
                value={0}
                icon={<AssignmentIcon />}
                color="#3B82F6"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.completedToday")}
                value={0}
                icon={<CheckCircleIcon />}
                color="#10B981"
                trend={{ value: "+12%", positive: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title={t("dashboard.stats.slaBreaches")}
                value={0}
                icon={<WarningAmberIcon />}
                color="#EF4444"
              />
            </Grid>
          </>
        )}
      </Grid>

      {/* Secondary widgets */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    {t("dashboard.recentActivity")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("dashboard.recentActivitySub")}
                  </Typography>
                </Box>
                <Button
                  endIcon={<ArrowForwardIcon />}
                  size="small"
                  onClick={() => navigate(role === "student" ? "/student/requests" : "/admin/audit")}
                >
                  {t("common.viewAll")}
                </Button>
              </Stack>
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
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={700} mb={2}>
                {t("dashboard.profile")}
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center" mb={3}>
                <Avatar
                  src={user.image_path || undefined}
                  sx={{
                    width: 56,
                    height: 56,
                    fontSize: 20,
                    fontWeight: 700,
                    background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
                  }}
                >
                  {user.full_name
                    ?.split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={700} noWrap>
                    {user.full_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {user.email || user.external_student_id}
                  </Typography>
                </Box>
              </Stack>

              {role === "student" && (
                <Stack spacing={1.5}>
                  <ProfileRow label={t("profile.group")} value={user.group_name} />
                  <ProfileRow label={t("profile.specialty")} value={user.specialty} />
                  <ProfileRow
                    label={t("profile.level")}
                    value={user.level ? `${user.level}-kurs` : null}
                  />
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, ((user.semester || 0) / 8) * 100)}
                    sx={{ height: 6, borderRadius: 3, mt: 1 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {user.semester ? `${user.semester}/8 semestr` : "—"}
                  </Typography>
                </Stack>
              )}
              <Button
                fullWidth
                variant="outlined"
                sx={{ mt: 3 }}
                onClick={() => navigate("/profile")}
              >
                {t("dashboard.viewProfile")}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function ProfileRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: "60%" }}>
        {value || "—"}
      </Typography>
    </Stack>
  );
}
