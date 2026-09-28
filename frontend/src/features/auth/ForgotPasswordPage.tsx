import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from "@mui/material";

import { useForgotPasswordMutation } from "@/features/auth/authApi";
import { formatApiError } from "@/shared/api/errors";
import BrandMark from "@/shared/components/BrandMark";
import ThemeToggle from "@/shared/components/ThemeToggle";

/** Public page: request a password-reset email. */
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [forgot, state] = useForgotPasswordMutation();
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const email = String(new FormData(e.currentTarget).get("email"));
    try {
      await forgot({ email }).unwrap();
      // The server answers the same whether or not the address exists.
      setSent(true);
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  return (
    <AuthCard title={t("auth.forgotTitle")}>
      {sent ? (
        <Alert severity="success">{t("auth.forgotSent")}</Alert>
      ) : (
        <Box component="form" onSubmit={submit}>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {t("auth.forgotHint")}
            </Typography>
            {err && <Alert severity="error">{err}</Alert>}
            <TextField
              name="email"
              type="email"
              label={t("auth.email")}
              autoComplete="username"
              required
              fullWidth
              autoFocus
            />
            <Button type="submit" variant="contained" disabled={state.isLoading}>
              {t("auth.forgotSubmit")}
            </Button>
          </Stack>
        </Box>
      )}
    </AuthCard>
  );
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        px: 2,
        py: 4,
        bgcolor: "background.default",
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 420 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1.5} alignItems="center"><BrandMark /><Typography variant="h5">ROYD</Typography></Stack>
            <ThemeToggle />
          </Stack>
          <Typography variant="h5" fontWeight={600} mb={2}>
            {title}
          </Typography>
          {children}
          <Link
            component={RouterLink}
            to="/login"
            variant="body2"
            sx={{ display: "block", mt: 3, textAlign: "center" }}
          >
            {t("auth.backToLogin")}
          </Link>
        </CardContent>
      </Card>
    </Box>
  );
}
