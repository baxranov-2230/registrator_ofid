import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";

import { useLoginStaffMutation, useLoginStudentMutation } from "@/features/auth/authApi";
import { tokensReceived } from "@/features/auth/authSlice";

export default function LoginPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"staff" | "student">("student");
  const [err, setErr] = useState<string | null>(null);

  const [loginStaff, staffState] = useLoginStaffMutation();
  const [loginStudent, studentState] = useLoginStudentMutation();

  const loading = staffState.isLoading || studentState.isLoading;

  const handleStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await loginStaff({
        email: String(data.get("email")),
        password: String(data.get("password")),
      }).unwrap();
      dispatch(tokensReceived({ access: res.access_token, refresh: res.refresh_token }));
      navigate("/");
    } catch (e: unknown) {
      setErr(extractError(e) || t("auth.loginFailed"));
    }
  };

  const handleStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await loginStudent({
        username: String(data.get("username")),
        password: String(data.get("password")),
      }).unwrap();
      dispatch(tokensReceived({ access: res.access_token, refresh: res.refresh_token }));
      navigate("/");
    } catch (e: unknown) {
      setErr(extractError(e) || t("auth.loginFailed"));
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Stack spacing={2} alignItems="center" mb={2}>
          <Typography variant="h4" color="primary">
            {t("app.name")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("app.tagline")}
          </Typography>
        </Stack>

        <Tabs
          value={tab}
          onChange={(_, v) => {
            setTab(v);
            setErr(null);
          }}
          variant="fullWidth"
          sx={{ mb: 2 }}
        >
          <Tab label={t("auth.studentLogin")} value="student" />
          <Tab label={t("auth.staffLogin")} value="staff" />
        </Tabs>

        {err && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        )}

        {tab === "student" ? (
          <Box component="form" onSubmit={handleStudent}>
            <Stack spacing={2}>
              <TextField
                name="username"
                label={t("auth.hemisId")}
                autoComplete="username"
                required
                fullWidth
              />
              <TextField
                name="password"
                label={t("auth.password")}
                type="password"
                autoComplete="current-password"
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {t("auth.submit")}
              </Button>
              <Typography variant="caption" color="text.secondary" textAlign="center">
                Dev: STU001 / student1
              </Typography>
            </Stack>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleStaff}>
            <Stack spacing={2}>
              <TextField
                name="email"
                label={t("auth.email")}
                type="email"
                autoComplete="username"
                required
                fullWidth
              />
              <TextField
                name="password"
                label={t("auth.password")}
                type="password"
                autoComplete="current-password"
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {t("auth.submit")}
              </Button>
              <Typography variant="caption" color="text.secondary" textAlign="center">
                Dev: admin@royd.uz / admin123
              </Typography>
            </Stack>
          </Box>
        )}
      </Paper>
    </Container>
  );
}

function extractError(e: unknown): string | null {
  if (typeof e === "object" && e && "data" in e) {
    const data = (e as { data?: { detail?: string } }).data;
    if (data?.detail) return data.detail;
  }
  return null;
}
