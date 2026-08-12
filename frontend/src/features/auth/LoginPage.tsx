import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Fade,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import LoginIcon from "@mui/icons-material/LoginOutlined";
import SchoolIcon from "@mui/icons-material/SchoolOutlined";
import BadgeIcon from "@mui/icons-material/BadgeOutlined";
import BoltIcon from "@mui/icons-material/BoltOutlined";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import ForumIcon from "@mui/icons-material/ForumOutlined";

import {
  useExchangeHemisTokenMutation,
  useLoginStaffMutation,
} from "@/features/auth/authApi";
import { tokensReceived } from "@/features/auth/authSlice";
import { hemisLogin } from "@/features/auth/hemisService";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher";

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
  const [tab, setTab] = useState<"staff" | "student">("student");
  const [err, setErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [loginStaff, staffState] = useLoginStaffMutation();
  const [exchangeHemisToken, exchangeState] = useExchangeHemisTokenMutation();
  const [studentLoading, setStudentLoading] = useState(false);

  const loading = staffState.isLoading || exchangeState.isLoading || studentLoading;

  const handleStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await loginStaff({
        email: String(data.get("email")),
        password: String(data.get("password")),
      }).unwrap();
      dispatch(tokensReceived({ access: res.access_token }));
      navigate("/");
    } catch (e: unknown) {
      setErr(extractError(e) || t("auth.loginFailed"));
    }
  };

  const handleStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    setStudentLoading(true);
    const data = new FormData(e.currentTarget);
    try {
      // Step 1 — authenticate directly against HEMIS (student.ndki.uz) via Vite proxy
      const { token: hemisToken } = await hemisLogin(
        String(data.get("username")),
        String(data.get("password")),
      );
      // Step 2 — exchange HEMIS token for local JWT (backend validates /me + syncs user)
      const res = await exchangeHemisToken({ hemis_token: hemisToken }).unwrap();
      dispatch(tokensReceived({ access: res.access_token }));
      navigate("/");
    } catch (e: unknown) {
      setErr(extractError(e) || (e instanceof Error ? e.message : t("auth.loginFailed")));
    } finally {
      setStudentLoading(false);
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
        borderRadius: 2.5,
        background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
        boxShadow: "0 8px 20px rgba(79,70,229,0.28)",
        transition: "transform .15s, box-shadow .15s",
        "&:hover": {
          boxShadow: "0 10px 26px rgba(79,70,229,0.38)",
          transform: "translateY(-1px)",
        },
        "&:active": { transform: "translateY(0)" },
        "&.Mui-disabled": { background: "#C7D2FE", color: "#fff" },
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
          color: "#fff",
          background: "linear-gradient(135deg, #4338CA 0%, #4F46E5 45%, #7C3AED 100%)",
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
            background: "radial-gradient(circle, rgba(255,255,255,.22) 0%, transparent 68%)",
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
            background: "radial-gradient(circle, rgba(255,255,255,.16) 0%, transparent 68%)",
            animation: `${drift} 20s ease-in-out infinite reverse`,
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        />

        <Box sx={{ position: "relative", maxWidth: 520 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 5, ...rise(0) }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 3,
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                fontSize: 24,
                bgcolor: "rgba(255,255,255,.16)",
                border: "1px solid rgba(255,255,255,.25)",
                backdropFilter: "blur(6px)",
              }}
            >
              R
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={800} lineHeight={1.15}>
                ROYD
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                Registrator Ofis
              </Typography>
            </Box>
          </Stack>

          <Typography
            variant="h3"
            fontWeight={800}
            sx={{ letterSpacing: "-0.03em", lineHeight: 1.12, mb: 2, ...rise(90) }}
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
                    bgcolor: "rgba(255,255,255,.14)",
                    border: "1px solid rgba(255,255,255,.2)",
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
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
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
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2.5,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 20,
                background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
              }}
            >
              R
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2}>
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
              fontWeight={800}
              sx={{ letterSpacing: "-0.02em", fontSize: { xs: "1.6rem", sm: "2rem" } }}
            >
              {t("auth.welcome")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>
              {t("auth.welcomeHint")}
            </Typography>
          </Box>

          <Box sx={rise(130)}>
            <Tabs
              value={tab}
              onChange={(_, v) => {
                setTab(v);
                setErr(null);
              }}
              variant="fullWidth"
              sx={{
                mb: 3,
                minHeight: 44,
                p: 0.5,
                borderRadius: 2.5,
                bgcolor: "rgba(79,70,229,0.06)",
                "& .MuiTabs-indicator": {
                  height: "100%",
                  borderRadius: 2,
                  bgcolor: "background.paper",
                  boxShadow: "0 1px 3px rgba(15,23,42,0.10)",
                  zIndex: 0,
                },
                "& .MuiTab-root": {
                  minHeight: 38,
                  zIndex: 1,
                  borderRadius: 2,
                  fontWeight: 600,
                  fontSize: { xs: 13, sm: 14 },
                  minWidth: 0,
                  px: { xs: 1, sm: 2 },
                  transition: "color .2s",
                  "&.Mui-selected": { color: "primary.main" },
                  // Below 380px the icon steals the room the label needs and
                  // the tab wraps to two lines.
                  "& .MuiTab-iconWrapper": {
                    display: { xs: "none", sm: "inline-flex" },
                  },
                },
              }}
            >
              <Tab
                icon={<SchoolIcon fontSize="small" />}
                iconPosition="start"
                label={t("auth.studentLogin")}
                value="student"
              />
              <Tab
                icon={<BadgeIcon fontSize="small" />}
                iconPosition="start"
                label={t("auth.staffLogin")}
                value="staff"
              />
            </Tabs>
          </Box>

          <Collapse in={Boolean(err)} unmountOnExit>
            <Alert severity="error" onClose={() => setErr(null)} sx={{ mb: 2, borderRadius: 2.5 }}>
              {err}
            </Alert>
          </Collapse>

          {/* Keyed so switching tabs re-runs the fade instead of swapping
              fields in place, which read as a glitch. */}
          <Fade in key={tab} timeout={380}>
            <Box sx={rise(190)}>
              {tab === "student" ? (
                <Box component="form" onSubmit={handleStudent}>
                  <Stack spacing={2.25}>
                    <TextField
                      name="username"
                      label={t("auth.hemisId")}
                      autoComplete="username"
                      required
                      fullWidth
                      autoFocus
                    />
                    {passwordField}
                    {submitButton}
                  </Stack>
                </Box>
              ) : (
                <Box component="form" onSubmit={handleStaff}>
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
                  </Stack>
                </Box>
              )}
            </Box>
          </Fade>

          {/* Seeded credentials are a dev convenience and must never ship to
              a real deployment, so they are stripped from production builds. */}
          {import.meta.env.DEV && (
            <Typography
              variant="caption"
              color="text.secondary"
              textAlign="center"
              sx={{ mt: 3, px: 1.5, py: 1, borderRadius: 2, bgcolor: "action.hover" }}
            >
              {tab === "student" ? "Dev: STU001 / student1" : "Dev: admin@royd.uz / admin123"}
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
