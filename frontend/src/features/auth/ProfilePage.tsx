import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import SchoolIcon from "@mui/icons-material/School";
import BadgeIcon from "@mui/icons-material/Badge";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import CakeIcon from "@mui/icons-material/Cake";
import HomeIcon from "@mui/icons-material/Home";
import GroupIcon from "@mui/icons-material/Group";

import type { RootState } from "@/app/store";

export default function ProfilePage() {
  const { t } = useTranslation();
  const user = useSelector((s: RootState) => s.auth.user);

  if (!user) return null;

  const isStudent = user.role.name === "student";
  const initials = user.full_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Box>
      <Paper sx={{ p: 4, mb: 3 }}>
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
                label={user.role.description || user.role.name}
                color="primary"
                variant="outlined"
              />
              {isStudent && user.external_student_id && (
                <Chip icon={<SchoolIcon />} label={user.external_student_id} variant="outlined" />
              )}
              {isStudent && user.group_name && (
                <Chip icon={<GroupIcon />} label={user.group_name} variant="outlined" />
              )}
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

        {isStudent && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" mb={2}>
                  {t("profile.academic")}
                </Typography>
                <Stack spacing={2}>
                  <InfoRow label={t("profile.studentId")} value={user.external_student_id} />
                  <InfoRow label={t("profile.specialty")} value={user.specialty} />
                  <InfoRow label={t("profile.group")} value={user.group_name} />
                  <InfoRow
                    label={t("profile.level")}
                    value={user.level ? `${user.level}-kurs` : null}
                  />
                  <InfoRow
                    label={t("profile.semester")}
                    value={user.semester ? `${user.semester}-semestr` : null}
                  />
                  <Divider />
                  <InfoRow label={t("profile.studentStatus")} value={user.student_status} />
                  <InfoRow label={t("profile.educationForm")} value={user.education_form} />
                  <InfoRow label={t("profile.educationType")} value={user.education_type} />
                  <InfoRow label={t("profile.educationLang")} value={user.education_lang} />
                  <InfoRow label={t("profile.paymentForm")} value={user.payment_form} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}
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
