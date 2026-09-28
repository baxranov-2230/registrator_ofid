import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LockIcon from "@mui/icons-material/LockOutlined";
import SecurityIcon from "@mui/icons-material/VerifiedUserOutlined";

import {
  useChangePasswordMutation,
  useDisableTotpMutation,
  useEnableTotpMutation,
  useGetMeQuery,
  useSetupTotpMutation,
  type TotpSetup,
} from "@/features/auth/authApi";
import { tokensReceived, userLoaded } from "@/features/auth/authSlice";
import { formatApiError } from "@/shared/api/errors";

/** Password change and two-factor enrolment for the signed-in user. */
export default function SecuritySettings() {
  return (
    <Stack spacing={3}>
      <PasswordCard />
      <TwoFactorCard />
    </Stack>
  );
}

function PasswordCard() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [changePassword, state] = useChangePasswordMutation();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const next = String(data.get("new"));
    if (next !== String(data.get("confirm"))) {
      setMsg({ ok: false, text: t("auth.passwordsDiffer") });
      return;
    }
    try {
      const res = await changePassword({
        current_password: String(data.get("current")),
        new_password: next,
      }).unwrap();
      // Every other session was signed out; this one continues on new tokens.
      dispatch(tokensReceived({ access: res.access_token }));
      form.reset();
      setMsg({ ok: true, text: t("profile.passwordChanged") });
    } catch (err: unknown) {
      setMsg({ ok: false, text: formatApiError(err, t("common.error")) });
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" mb={2}>
          <LockIcon color="action" />
          <Typography variant="h6">{t("profile.changePassword")}</Typography>
        </Stack>
        <Box component="form" onSubmit={submit}>
          <Stack spacing={2}>
            {msg && <Alert severity={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
            <TextField
              name="current"
              type="password"
              label={t("profile.currentPassword")}
              autoComplete="current-password"
              required
              fullWidth
            />
            <TextField
              name="new"
              type="password"
              label={t("auth.newPassword")}
              autoComplete="new-password"
              helperText={t("auth.passwordRules")}
              required
              fullWidth
            />
            <TextField
              name="confirm"
              type="password"
              label={t("auth.confirmPassword")}
              autoComplete="new-password"
              required
              fullWidth
            />
            <Box>
              <Button type="submit" variant="contained" disabled={state.isLoading}>
                {t("common.save")}
              </Button>
            </Box>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}

function TwoFactorCard() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  // Read fresh from the server: the slice's copy is loaded once per session.
  const { data: me } = useGetMeQuery();
  const [setupTotp, setupState] = useSetupTotpMutation();
  const [enableTotp, enableState] = useEnableTotpMutation();
  const [disableTotp, disableState] = useDisableTotpMutation();
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (me) dispatch(userLoaded(me));
  }, [me, dispatch]);

  const enabled = me?.totp_enabled ?? false;

  const start = async () => {
    setMsg(null);
    try {
      setSetup(await setupTotp().unwrap());
    } catch (err: unknown) {
      setMsg({ ok: false, text: formatApiError(err, t("common.error")) });
    }
  };

  const confirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    try {
      await enableTotp({ code }).unwrap();
      setSetup(null);
      setMsg({ ok: true, text: t("profile.twoFactorEnabled") });
    } catch (err: unknown) {
      setMsg({ ok: false, text: formatApiError(err, t("common.error")) });
    }
  };

  const turnOff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await disableTotp({
        password: String(data.get("password")),
        code: String(data.get("code")).replace(/\s/g, ""),
      }).unwrap();
      setMsg({ ok: true, text: t("profile.twoFactorDisabled") });
    } catch (err: unknown) {
      setMsg({ ok: false, text: formatApiError(err, t("common.error")) });
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <SecurityIcon color="action" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t("profile.twoFactor")}
          </Typography>
          <Chip
            size="small"
            color={enabled ? "success" : "default"}
            label={enabled ? t("profile.twoFactorOn") : t("profile.twoFactorOff")}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {t("profile.twoFactorHint")}
        </Typography>
        {msg && (
          <Alert severity={msg.ok ? "success" : "error"} sx={{ mb: 2 }}>
            {msg.text}
          </Alert>
        )}

        {enabled ? (
          <Box component="form" onSubmit={turnOff}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                name="password"
                type="password"
                size="small"
                label={t("auth.password")}
                autoComplete="current-password"
                required
              />
              <TextField
                name="code"
                size="small"
                label={t("auth.mfaCode")}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
              <Button type="submit" color="error" variant="outlined" disabled={disableState.isLoading}>
                {t("profile.twoFactorDisable")}
              </Button>
            </Stack>
          </Box>
        ) : setup ? (
          <Box component="form" onSubmit={confirm}>
            <Stack spacing={2}>
              <Typography variant="body2">{t("profile.twoFactorScan")}</Typography>
              <Box
                component="img"
                src={setup.qr_svg}
                alt="QR"
                sx={{ width: 200, height: 200, bgcolor: "#fff", p: 1, borderRadius: 1 }}
              />
              <Typography variant="caption" color="text.secondary">
                {t("profile.twoFactorManual")}{" "}
                <Box component="code" sx={{ wordBreak: "break-all" }}>
                  {setup.secret}
                </Box>
              </Typography>
              <Divider />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  name="code"
                  size="small"
                  label={t("auth.mfaCode")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  autoFocus
                />
                <Button type="submit" variant="contained" disabled={enableState.isLoading}>
                  {t("profile.twoFactorConfirm")}
                </Button>
              </Stack>
            </Stack>
          </Box>
        ) : (
          <Button variant="contained" onClick={start} disabled={setupState.isLoading}>
            {t("profile.twoFactorSetup")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
