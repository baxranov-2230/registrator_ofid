import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Box, Button, Stack, TextField } from "@mui/material";

import { useResetPasswordMutation } from "@/features/auth/authApi";
import { AuthCard } from "@/features/auth/ForgotPasswordPage";
import { formatApiError } from "@/shared/api/errors";

/** Public page opened from the reset email: set a new password. */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [reset, state] = useResetPasswordMutation();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirm"))) {
      setErr(t("auth.passwordsDiffer"));
      return;
    }
    try {
      await reset({ token, new_password: password }).unwrap();
      setDone(true);
    } catch (e: unknown) {
      setErr(formatApiError(e, t("common.error")));
    }
  };

  return (
    <AuthCard title={t("auth.resetTitle")}>
      {!token ? (
        <Alert severity="error">{t("auth.resetInvalidLink")}</Alert>
      ) : done ? (
        <Alert severity="success">{t("auth.resetDone")}</Alert>
      ) : (
        <Box component="form" onSubmit={submit}>
          <Stack spacing={2}>
            {err && <Alert severity="error">{err}</Alert>}
            <TextField
              name="password"
              type="password"
              label={t("auth.newPassword")}
              autoComplete="new-password"
              helperText={t("auth.passwordRules")}
              required
              fullWidth
              autoFocus
            />
            <TextField
              name="confirm"
              type="password"
              label={t("auth.confirmPassword")}
              autoComplete="new-password"
              required
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={state.isLoading}>
              {t("auth.resetSubmit")}
            </Button>
          </Stack>
        </Box>
      )}
    </AuthCard>
  );
}
