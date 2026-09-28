import { IconButton, Tooltip } from "@mui/material";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import { useTranslation } from "react-i18next";
import { useAppearance } from "@/app/appearance";

export default function ThemeToggle() {
  const { t } = useTranslation();
  const { mode, toggleMode } = useAppearance();
  const label = t(mode === "light" ? "nav.darkMode" : "nav.lightMode");
  return (
    <Tooltip title={label}>
      <IconButton onClick={toggleMode} aria-label={label} sx={{ width: 40, height: 40, bgcolor: "background.default", color: "text.primary" }}>
        {mode === "light" ? <DarkModeOutlined fontSize="small" /> : <LightModeOutlined fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
