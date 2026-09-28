import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import BadgeIcon from "@mui/icons-material/Badge";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import CakeIcon from "@mui/icons-material/Cake";
import HomeIcon from "@mui/icons-material/Home";

import type { RootState } from "@/app/store";
import SecuritySettings from "@/features/auth/SecuritySettings";
import PageHeader from "@/shared/components/PageHeader";

export default function ProfilePage() {
  const { t } = useTranslation();
  const user = useSelector((s: RootState) => s.auth.user);

  if (!user) return null;

  const initials = user.full_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Box>
      <PageHeader title={t("nav.profile")} />
      <Paper sx={{ p: { xs: 2.5, md: 4 }, mb: 3, borderRadius: "8px", borderTop: "4px solid", borderColor: "primary.main" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="center">
          <Avatar
            src={user.image_path || undefined}
            sx={{ width: 100, height: 100, fontSize: 36, bgcolor: "primary.main" }}
          >
            {initials}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h5" fontWeight={700}>
              {user.full_name}
            </Typography>
            <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
              <Chip
                icon={<BadgeIcon />}
                label={t(`role.${user.role.name}`)}
                color="primary"
                variant="outlined"
              />
            </Stack>
          </Box>
        </Stack>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                {t("profile.contact")}
              </Typography>
              <Stack spacing={2}>
                <InfoRow
                  icon={<EmailIcon fontSize="small" />}
                  label={t("profile.email")}
                  value={user.email}
                />
                <InfoRow
                  icon={<PhoneIcon fontSize="small" />}
                  label={t("profile.phone")}
                  value={user.phone}
                />
                <InfoRow
                  icon={<CakeIcon fontSize="small" />}
                  label={t("profile.birthDate")}
                  value={user.birth_date}
                />
                <InfoRow
                  icon={<HomeIcon fontSize="small" />}
                  label={t("profile.address")}
                  value={user.address}
                />
                <InfoRow label={t("profile.gender")} value={translateGender(user.gender, t)} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <SecuritySettings />
        </Grid>
      </Grid>
    </Box>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      {icon && <Box sx={{ color: "text.secondary", mt: 0.3 }}>{icon}</Box>}
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="caption" color="text.secondary" display="block">
          {label}
        </Typography>
        <Typography variant="body2" sx={{ color: value ? "text.primary" : "text.disabled" }}>
          {value || "—"}
        </Typography>
      </Box>
    </Stack>
  );
}

function translateGender(g: string | null, t: (k: string) => string): string | null {
  if (!g) return null;
  const key = g.toLowerCase();
  if (key === "male" || key === "m" || key === "erkak") return t("profile.male");
  if (key === "female" || key === "f" || key === "ayol") return t("profile.female");
  return g;
}
