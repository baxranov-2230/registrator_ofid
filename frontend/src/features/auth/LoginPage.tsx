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
  useTheme,
} from "@mui/material";
import { alpha, keyframes } from "@mui/material/styles";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForwardRounded";
import MailIcon from "@mui/icons-material/MailOutlineRounded";
import LockIcon from "@mui/icons-material/LockOutlined";
import ShieldIcon from "@mui/icons-material/VerifiedUserOutlined";
import SchoolIcon from "@mui/icons-material/SchoolOutlined";
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

const noMotion = { "@media (prefers-reduced-motion: reduce)": { animation: "none" } };

/** Staggered entrance so the panel assembles rather than snapping in. */
const rise = (delay: number) => ({
  animation: `${riseIn} .55s cubic-bezier(.21,.6,.35,1) both`,
  animationDelay: `${delay}ms`,
  ...noMotion,
});

const HIGHLIGHTS = [
  { icon: <BoltIcon />, key: "auth.featureFast" },
  { icon: <TrackChangesIcon />, key: "auth.featureTrack" },
  { icon: <ForumIcon />, key: "auth.featureChat" },
];

export default function LoginPage() {
  const { t } = useTranslation();
  const theme = useTheme();
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

  const dark = theme.palette.mode === "dark";
  const primary = theme.palette.primary;
  const fieldBg = alpha(theme.palette.text.primary, dark ? 0.05 : 0.025);

  /* Soft filled inputs with a focus ring. The autofill override stops Chrome
     painting its own pale-blue fill, which clashed with the field and left
     the password adornment on a different background. */
  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      bgcolor: fieldBg,
      transition: "box-shadow .2s ease, background-color .2s ease",
      "& fieldset": { borderColor: theme.palette.divider },
      "&:hover fieldset": { borderColor: alpha(primary.main, 0.5) },
      "&.Mui-focused": {
        bgcolor: "background.paper",
        boxShadow: `0 0 0 4px ${alpha(primary.main, 0.14)}`,
      },
      "&.Mui-focused .MuiInputAdornment-positionStart svg": { color: primary.main },
    },
    "& .MuiInputAdornment-positionStart svg": {
      color: "text.secondary",
      transition: "color .2s ease",
    },
    "& input": { py: 1.75 },
    "& input:-webkit-autofill": {
      WebkitBoxShadow: `0 0 0 100px ${theme.palette.background.paper} inset`,
      WebkitTextFillColor: theme.palette.text.primary,
      caretColor: theme.palette.text.primary,
      borderRadius: 0,
    },
  };

  const startIcon = (icon: React.ReactNode) => (
    <InputAdornment position="start">{icon}</InputAdornment>
  );

  const passwordField = (
    <TextField
      name="password"
      label={t("auth.password")}
      type={showPassword ? "text" : "password"}
      autoComplete="current-password"
      required
      fullWidth
      sx={fieldSx}
      InputProps={{
        startAdornment: startIcon(<LockIcon fontSize="small" />),
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              onClick={() => setShowPassword((v) => !v)}
              edge="end"
              aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
            >
              {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );

  const buttonGradient = `linear-gradient(135deg, ${primary.main} 0%, ${primary.dark} 100%)`;
  const submitButton = (
    <Button
      type="submit"
      variant="contained"
      size="large"
      disabled={loading}
      endIcon={
        loading ? <CircularProgress size={16} color="inherit" /> : <ArrowForwardIcon />
      }
      sx={{
        height: 52,
        fontSize: "1rem",
        borderRadius: "12px",
        background: buttonGradient,
        boxShadow: `0 10px 24px -10px ${alpha(primary.main, 0.7)}`,
        transition: "transform .15s ease, box-shadow .2s ease",
        "& .MuiButton-endIcon": { transition: "transform .2s ease" },
        "&:hover": {
          background: buttonGradient,
          transform: "translateY(-1px)",
          boxShadow: `0 14px 28px -10px ${alpha(primary.main, 0.8)}`,
        },
        "&:hover .MuiButton-endIcon": { transform: "translateX(3px)" },
        "&:active": { transform: "none" },
        "&.Mui-disabled": { background: buttonGradient, color: "#fff", opacity: 0.75 },
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
        bgcolor: "background.paper",
      }}
    >
      {/* ── Brand panel ─────────────────────────────────────────────── */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          position: "relative",
          overflow: "hidden",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 6,
          p: { md: 6, lg: 8 },
          color: "#fff",
          background: dark
            ? "linear-gradient(150deg, #0A2624 0%, #11443F 55%, #17685F 100%)"
            : "linear-gradient(150deg, #0D4A44 0%, #177A6E 50%, #25A194 100%)",
        }}
      >
        {/* Dot grid, faded out towards the edges, for texture without noise. */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,.16) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(ellipse 70% 60% at 30% 45%, #000 20%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 30% 45%, #000 20%, transparent 75%)",
          }}
        />
        {/* Slow-drifting glows give the panel depth without a background image. */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            width: 560,
            height: 560,
            top: -200,
            right: -160,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(94,234,212,.28) 0%, transparent 65%)",
            animation: `${drift} 16s ease-in-out infinite`,
            ...noMotion,
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            width: 460,
            height: 460,
            bottom: -180,
            left: -140,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,122,44,.22) 0%, transparent 65%)",
            animation: `${drift} 20s ease-in-out infinite reverse`,
            ...noMotion,
          }}
        />

        <Stack direction="row" spacing={2} alignItems="center" sx={{ position: "relative", ...rise(0) }}>
          <Box
            sx={{
              p: 0.75,
              borderRadius: "16px",
              bgcolor: "rgba(255,255,255,.12)",
              border: "1px solid rgba(255,255,255,.22)",
              "& > div": { bgcolor: "#fff", color: primary.dark },
            }}
          >
            <BrandMark size={44} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} lineHeight={1.15} letterSpacing="0.02em">
              ROYD
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              Registrator Ofis
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ position: "relative", maxWidth: 540 }}>
          <Typography
            variant="h3"
            fontWeight={700}
            sx={{
              fontSize: { md: "2.4rem", lg: "3rem" },
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
              mb: 2.5,
              ...rise(90),
            }}
          >
            {t("auth.heroTitle")}
          </Typography>
          <Typography
            variant="body1"
            sx={{ opacity: 0.82, maxWidth: 440, mb: 5, ...rise(160) }}
          >
            {t("auth.heroSubtitle")}
          </Typography>

          <Stack spacing={1.5}>
            {HIGHLIGHTS.map((h, i) => (
              <Stack
                key={h.key}
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{
                  p: 1.5,
                  pr: 2.5,
                  maxWidth: 460,
                  borderRadius: "14px",
                  bgcolor: "rgba(255,255,255,.07)",
                  border: "1px solid rgba(255,255,255,.12)",
                  backdropFilter: "blur(8px)",
                  transition: "background-color .2s ease, transform .2s ease",
                  "&:hover": { bgcolor: "rgba(255,255,255,.11)", transform: "translateX(4px)" },
                  ...rise(240 + i * 90),
                }}
              >
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: "10px",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "rgba(255,255,255,.14)",
                    color: "#fff",
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

        <Stack
          direction="row"
          spacing={1.25}
          alignItems="center"
          sx={{ position: "relative", opacity: 0.8, ...rise(520) }}
        >
          <SchoolIcon fontSize="small" />
          <Typography variant="body2">{t("auth.footerNote")}</Typography>
        </Stack>
      </Box>

      {/* ── Form panel ──────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          px: { xs: 2.5, sm: 5, md: 6 },
          py: { xs: 2.5, md: 4 },
          minWidth: 0,
          background: `radial-gradient(700px circle at 100% 0%, ${alpha(primary.main, dark ? 0.12 : 0.07)}, transparent 60%)`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          {/* Compact brand mark, shown only where the hero panel is hidden. */}
          <Stack
            direction="row"
            spacing={1.25}
            alignItems="center"
            sx={{ display: { md: "none" }, ...rise(0) }}
          >
            <BrandMark size={36} />
            <Box>
              <Typography variant="subtitle2" fontWeight={700} lineHeight={1.2}>
                ROYD
              </Typography>
              <Typography variant="caption" color="text.secondary" lineHeight={1.2}>
                Registrator Ofis
              </Typography>
            </Box>
          </Stack>
          <Box sx={{ flexGrow: 1 }} />
          <ThemeToggle />
          <LanguageSwitcher />
        </Stack>

        <Box
          sx={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "100%",
            maxWidth: 400,
            mx: "auto",
            py: { xs: 5, md: 4 },
          }}
        >
          <Box sx={rise(60)}>
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              sx={{
                display: "inline-flex",
                px: 1.25,
                py: 0.5,
                mb: 2.5,
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                color: "primary.main",
                bgcolor: alpha(primary.main, dark ? 0.16 : 0.09),
                border: `1px solid ${alpha(primary.main, 0.22)}`,
              }}
            >
              <ShieldIcon sx={{ fontSize: 15 }} />
              <span>{t("auth.staffBadge")}</span>
            </Stack>
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{ letterSpacing: "-0.025em", fontSize: { xs: "1.75rem", sm: "2.1rem" } }}
            >
              {t("auth.welcome")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 4 }}>
              {mfaToken ? t("auth.mfaHint") : t("auth.welcomeHint")}
            </Typography>
          </Box>

          <Collapse in={Boolean(err)} unmountOnExit>
            <Alert severity="error" onClose={() => setErr(null)} sx={{ mb: 2.5, borderRadius: "12px" }}>
              {err}
            </Alert>
          </Collapse>

          {mfaToken ? (
            <Box component="form" onSubmit={handleCode} sx={rise(0)}>
              <Stack spacing={2.5}>
                <TextField
                  name="code"
                  label={t("auth.mfaCode")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  inputProps={{
                    maxLength: 8,
                    pattern: "[0-9 ]*",
                    style: { letterSpacing: "0.3em", fontWeight: 600 },
                  }}
                  InputProps={{ startAdornment: startIcon(<ShieldIcon fontSize="small" />) }}
                  sx={fieldSx}
                  required
                  fullWidth
                  autoFocus
                />
                {submitButton}
                <Link
                  component="button"
                  type="button"
                  variant="body2"
                  underline="hover"
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
              <Stack spacing={2.5}>
                <TextField
                  name="email"
                  label={t("auth.email")}
                  type="email"
                  autoComplete="username"
                  InputProps={{ startAdornment: startIcon(<MailIcon fontSize="small" />) }}
                  sx={fieldSx}
                  required
                  fullWidth
                  autoFocus
                />
                <Box>
                  {passwordField}
                  <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
                    <Link
                      component={RouterLink}
                      to="/forgot-password"
                      variant="body2"
                      underline="hover"
                      fontWeight={500}
                    >
                      {t("auth.forgotPassword")}
                    </Link>
                  </Box>
                </Box>
                {submitButton}
              </Stack>
            </Box>
          )}
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          textAlign="center"
          sx={rise(260)}
        >
          © {new Date().getFullYear()} ROYD
          {/* The brand panel carries the university name on desktop. */}
          <Box component="span" sx={{ display: { md: "none" } }}>
            {" · "}
            {t("auth.footerNote")}
          </Box>
        </Typography>
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
