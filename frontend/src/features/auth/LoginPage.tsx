import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import LoginIcon from "@mui/icons-material/LoginOutlined";
import BoltIcon from "@mui/icons-material/BoltOutlined";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import ForumIcon from "@mui/icons-material/ForumOutlined";

import {
  useLoginSecondFactorMutation,
  useLoginStaffMutation,
  type LoginResponse,
} from "@/features/auth/authApi";
import { tokensReceived } from "@/features/auth/authSlice";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher";
import BrandMark from "@/shared/components/BrandMark";
import ThemeToggle from "@/shared/components/ThemeToggle";

/* Motion is kept to slow, large-scale movement: it should make the page feel
   alive without competing with the form for attention. */
const drift = keyframes`
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(3%, -4%) scale(1.08); }
  100% { transform: translate(0, 0) scale(1); }
`;

const riseIn = keyframes`
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
`;

/** Staggered entrance so the panel assembles rather than snapping in. */
const rise = (delay: number) => ({
  animation: `${riseIn} .55s cubic-bezier(.21,.6,.35,1) both`,
  animationDelay: `${delay}ms`,
  // Respect users who have asked the OS to reduce motion.
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
});

const HIGHLIGHTS = [
  { icon: <BoltIcon />, key: "auth.featureFast" },
  { icon: <TrackChangesIcon />, key: "auth.featureTrack" },
  { icon: <ForumIcon />, key: "auth.featureChat" },
];

export default function LoginPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Students file requests from a separate platform that talks to our API
  // directly, so this page only signs in staff accounts.
  const [loginStaff, passwordState] = useLoginStaffMutation();
  const [loginSecondFactor, codeState] = useLoginSecondFactorMutation();
  const loading = passwordState.isLoading || codeState.isLoading;
  /** Set after a correct password on an account with 2FA on. */
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const finish = (res: LoginResponse) => {
    if (res.mfa_required && res.mfa_token) {
      setMfaToken(res.mfa_token);
      return;
    }
    if (res.access_token) {
      dispatch(tokensReceived({ access: res.access_token }));
      navigate("/");
    }
  };

  const handleStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const data = new FormData(e.currentTarget);
    try {
      finish(
        await loginStaff({
          email: String(data.get("email")),
          password: String(data.get("password")),
        }).unwrap(),
      );
    } catch (e: unknown) {
      setErr(extractError(e) || t("auth.loginFailed"));
    }
  };

  const handleCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mfaToken) return;
    setErr(null);
    const data = new FormData(e.currentTarget);
    try {
      finish(
        await loginSecondFactor({
          mfa_token: mfaToken,
          code: String(data.get("code")).replace(/\s/g, ""),
        }).unwrap(),
      );
    } catch (e: unknown) {
      setErr(extractError(e) || t("auth.loginFailed"));
    }
  };

  const passwordField = (
    <TextField
      name="password"
      label={t("auth.password")}
      type={showPassword ? "text" : "password"}
      autoComplete="current-password"
      required
      fullWidth
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              onClick={() => setShowPassword((v) => !v)}
              edge="end"
              aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
            >
              {showPassword ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );

  const submitButton = (
    <Button
      type="submit"
      variant="contained"
      size="large"
      disabled={loading}
      startIcon={
        loading ? <CircularProgress size={16} color="inherit" /> : <LoginIcon />
      }
      sx={{
        py: 1.35,
        fontSize: "1rem",
        borderRadius: "8px",
      }}
    >
      {loading ? t("auth.submitting") : t("auth.submit")}
    </Button>
  );

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "grid",
        // Brand panel is desktop-only: on a phone it would push the form
        // below the fold, which is the one thing the page must not do.
        gridTemplateColumns: { xs: "1fr", md: "1.05fr 1fr" },
        bgcolor: "background.default",
      }}
    >
      {/* ── Brand panel ─────────────────────────────────────────────── */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          position: "relative",
          overflow: "hidden",
          flexDirection: "column",
          justifyContent: "center",
          p: 8,
          color: "text.primary",
          background: (theme) => theme.palette.mode === "light" ? "linear-gradient(135deg, #E6F7F5 0%, #F4FFFC 100%)" : "linear-gradient(135deg, #1B3438 0%, #273142 100%)",
        }}
      >
        {/* Slow-drifting blobs give the panel depth without a background image. */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            width: 520,
            height: 520,
            top: -160,
            right: -140,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(37,161,148,.12) 0%, transparent 68%)",
            animation: `${drift} 16s ease-in-out infinite`,
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            width: 420,
            height: 420,
            bottom: -140,
            left: -110,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,122,44,.10) 0%, transparent 68%)",
            animation: `${drift} 20s ease-in-out infinite reverse`,
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        />

        <Box sx={{ position: "relative", maxWidth: 520 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 5, ...rise(0) }}>
            <BrandMark size={52} />
            <Box>
              <Typography variant="h6" fontWeight={600} lineHeight={1.15}>
                ROYD
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                Registrator Ofis
              </Typography>
            </Box>
          </Stack>

          <Typography
            variant="h3"
            fontWeight={600}
            sx={{ fontSize: { md: "2.25rem", lg: "2.75rem" }, lineHeight: 1.25, mb: 2, ...rise(90) }}
          >
            {t("auth.heroTitle")}
          </Typography>
          <Typography
            variant="body1"
            sx={{ opacity: 0.9, maxWidth: 420, mb: 6, ...rise(160) }}
          >
            {t("auth.heroSubtitle")}
          </Typography>

          <Stack spacing={2.5}>
            {HIGHLIGHTS.map((h, i) => (
              <Stack
                key={h.key}
                direction="row"
                spacing={2}
                alignItems="center"
                sx={rise(240 + i * 90)}
              >
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "background.paper",
                    color: "primary.main",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  {h.icon}
                </Box>
                <Typography variant="body2" sx={{ opacity: 0.95 }}>
                  {t(h.key)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* ── Form panel ──────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          px: { xs: 2.5, sm: 5, md: 6 },
          py: { xs: 3, md: 5 },
          minWidth: 0,
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
          <ThemeToggle />
          <LanguageSwitcher />
        </Box>

        <Box
          sx={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "100%",
            maxWidth: 420,
            mx: "auto",
            py: { xs: 3, md: 0 },
          }}
        >
          {/* Compact brand mark, shown only where the hero panel is hidden. */}
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ display: { md: "none" }, mb: 3, ...rise(0) }}
          >
            <BrandMark size={44} />
            <Box>
              <Typography variant="subtitle1" fontWeight={600} lineHeight={1.2}>
                ROYD
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Registrator Ofis
              </Typography>
            </Box>
          </Stack>

          <Box sx={rise(60)}>
            <Typography
              variant="h4"
              fontWeight={600}
              sx={{ letterSpacing: "-0.02em", fontSize: { xs: "1.6rem", sm: "2rem" } }}
            >
              {t("auth.welcome")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>
              {t("auth.welcomeHint")}
            </Typography>
          </Box>

          <Collapse in={Boolean(err)} unmountOnExit>
            <Alert severity="error" onClose={() => setErr(null)} sx={{ mb: 2, borderRadius: 2.5 }}>
              {err}
            </Alert>
          </Collapse>

          {mfaToken ? (
            <Box component="form" onSubmit={handleCode} sx={rise(0)}>
              <Stack spacing={2.25}>
                <Typography variant="body2" color="text.secondary">
                  {t("auth.mfaHint")}
                </Typography>
                <TextField
                  name="code"
                  label={t("auth.mfaCode")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  inputProps={{ maxLength: 8, pattern: "[0-9 ]*" }}
                  required
                  fullWidth
                  autoFocus
                />
                {submitButton}
                <Link
                  component="button"
                  type="button"
                  variant="body2"
                  onClick={() => {
                    setMfaToken(null);
                    setErr(null);
                  }}
                >
                  {t("common.back")}
                </Link>
              </Stack>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleStaff} sx={rise(130)}>
              <Stack spacing={2.25}>
                <TextField
                  name="email"
                  label={t("auth.email")}
                  type="email"
                  autoComplete="username"
                  required
                  fullWidth
                  autoFocus
                />
                {passwordField}
                {submitButton}
                <Link
                  component={RouterLink}
                  to="/forgot-password"
                  variant="body2"
                  textAlign="center"
                >
                  {t("auth.forgotPassword")}
                </Link>
              </Stack>
            </Box>
          )}

          {/* Seeded credentials are a dev convenience and must never ship to
              a real deployment, so they are stripped from production builds. */}
          {import.meta.env.DEV && (
            <Typography
              variant="caption"
              color="text.secondary"
              textAlign="center"
              sx={{ mt: 3, px: 1.5, py: 1, borderRadius: 2, bgcolor: "action.hover" }}
            >
              Dev: admin@royd.uz / admin123
            </Typography>
          )}

          <Typography
            variant="caption"
            color="text.secondary"
            textAlign="center"
            sx={{ mt: 3, ...rise(260) }}
          >
            {t("auth.footerNote")}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function extractError(e: unknown): string | null {
  if (typeof e === "object" && e && "data" in e) {
    const data = (e as { data?: { detail?: string } }).data;
    if (data?.detail) return data.detail;
  }
  return null;
}
