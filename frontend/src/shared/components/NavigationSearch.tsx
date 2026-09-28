import { Autocomplete, InputAdornment, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { navItemsFor } from "@/shared/navItems";

export default function NavigationSearch({ role }: { role: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const options = [...navItemsFor(role).map(({ to, label }) => ({ to, label: t(label) })), { to: "/profile", label: t("nav.profile") }];
  return (
    <Autocomplete options={options} getOptionLabel={(option) => option.label} value={null} autoHighlight blurOnSelect clearOnBlur
      noOptionsText={t("nav.noSearchResults")}
      onChange={(_event, option) => { if (option) navigate(option.to); }}
      sx={{ width: "100%", maxWidth: 390 }}
      renderInput={(params) => <TextField {...params} size="small" placeholder={t("nav.searchPages")} inputProps={{ ...params.inputProps, "aria-label": t("nav.searchPages") }}
        InputProps={{ ...params.InputProps, startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 20, color: "text.secondary" }} /></InputAdornment> }} />}
    />
  );
}
