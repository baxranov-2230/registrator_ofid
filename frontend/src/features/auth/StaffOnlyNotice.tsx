import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";

import { useLogoutMutation } from "@/features/auth/authApi";
import { loggedOut } from "@/features/auth/authSlice";
import { api } from "@/shared/api/base";

/** Shown to a student session: requests are filed on the partner platform. */
export default function StaffOnlyNotice() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [logout, state] = useLogoutMutation();

  const signOut = async () => {
    try {
      await logout().unwrap();
    } catch {
      /* the local session is cleared either way */
    }
    dispatch(loggedOut());
    dispatch(api.util.resetApiState());
    navigate("/login");
  };

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", px: 2 }}>
      <Stack spacing={2} sx={{ maxWidth: 440, textAlign: "center" }}>
        <Typography variant="h5" fontWeight={600}>
          {t("auth.staffOnlyTitle")}
        </Typography>
        <Alert severity="info" sx={{ textAlign: "left" }}>
          {t("auth.staffOnlyBody")}
        </Alert>
        <Button variant="contained" onClick={signOut} disabled={state.isLoading}>
          {t("auth.logout")}
        </Button>
      </Stack>
    </Box>
  );
}
