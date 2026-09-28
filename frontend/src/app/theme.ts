import { alpha, createTheme } from "@mui/material/styles";

/** EduDash palette shared by charts, badges and the application theme. */
export const designColors = {
  primary: "#25A194",
  orange: "#FF7A2C",
  blue: "#2D57FE",
  purple: "#A80BE4",
  green: "#00C31D",
  cyan: "#04B4FF",
  red: "#DC2626",
  muted: "#6C757D",
};

export const createAppTheme = (mode: "light" | "dark") => {
  const dark = mode === "dark";
  const canvas = dark ? "#1B2431" : "#EEF2F6";
  const surface = dark ? "#273142" : "#FFFFFF";
  const text = dark ? "#F3F4F6" : "#212529";
  const muted = dark ? "#D1D5DB" : "#6C757D";
  const border = dark ? "#D1D5DB33" : "#E7EAEE";
  const soft = dark ? "#323D4E" : "#F8F9FA";
  const shadow = "0 4px 30px rgba(46, 45, 116, 0.05)";

  return createTheme({
    palette: {
      mode,
      primary: { main: designColors.primary, light: "#E6F7F5", dark: "#1C7F73", contrastText: "#FFFFFF" },
      secondary: { main: designColors.orange, light: "#FFF4EB", dark: "#B94C0E", contrastText: "#FFFFFF" },
      success: { main: "#15803D", light: "#DCFCE7", dark: "#166534" },
      warning: { main: "#C75B12", light: "#FFF4EB", dark: "#9A4109" },
      error: { main: designColors.red, light: "#FEE2E2", dark: "#991B1B" },
      info: { main: designColors.blue, light: "#E6EDFF", dark: "#1F40C9" },
      background: { default: canvas, paper: surface },
      text: { primary: text, secondary: muted, disabled: dark ? "#9CA3AF" : "#6C757D" },
      divider: border,
      action: { hover: alpha(designColors.primary, dark ? 0.12 : 0.06), selected: alpha(designColors.primary, 0.12) },
    },
    typography: {
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 14,
      h1: { fontSize: "3rem", fontWeight: 700, lineHeight: 1.2 },
      h2: { fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.25 },
      h3: { fontSize: "2rem", fontWeight: 600, lineHeight: 1.3 },
      h4: { fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.35 },
      h5: { fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.4 },
      h6: { fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.4 },
      body1: { fontSize: "1rem", lineHeight: 1.7 },
      body2: { fontSize: "0.875rem", lineHeight: 1.6 },
      subtitle1: { fontSize: "1rem", fontWeight: 600 },
      subtitle2: { fontSize: "0.875rem", fontWeight: 600 },
      caption: { fontSize: "0.75rem", lineHeight: 1.5 },
      button: { textTransform: "none", fontWeight: 600 },
      overline: { fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em" },
    },
    // sx borderRadius: 2 resolves to the reference's 8px corners.
    shape: { borderRadius: 4 },
    components: {
      MuiCssBaseline: { styleOverrides: {
        body: { backgroundColor: canvas },
        "::selection": { backgroundColor: "#99DDD5", color: "#212529" },
        "*:focus-visible": { outlineColor: designColors.primary },
      } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: {
        root: { borderRadius: 8, padding: "9px 18px", fontSize: 14 },
        sizeSmall: { padding: "5px 12px" },
        outlined: { borderColor: border },
      } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" }, elevation1: { boxShadow: shadow } } },
      MuiCard: { styleOverrides: { root: { border: "none", borderRadius: 8, backgroundColor: surface, boxShadow: shadow } } },
      MuiCardContent: { styleOverrides: { root: { padding: 20, "&:last-child": { paddingBottom: 20 } } } },
      MuiCardHeader: { styleOverrides: { root: { padding: "16px 20px", borderBottom: `1px solid ${border}` }, title: { fontSize: 18, fontWeight: 600 } } },
      MuiAppBar: { styleOverrides: { root: { backgroundColor: surface, color: text, boxShadow: "none", borderBottom: `1px solid ${border}` } } },
      MuiDrawer: { styleOverrides: { paper: { borderRight: `1px solid ${border}`, backgroundColor: surface } } },
      MuiListItemButton: { styleOverrides: { root: {
        borderRadius: 8, marginBottom: 4,
        "&.Mui-selected": { backgroundColor: designColors.primary, color: "#FFFFFF", "& .MuiListItemIcon-root": { color: "#FFFFFF" }, "&:hover": { backgroundColor: "#1C7F73" } },
      } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 500, borderRadius: 6 }, sizeSmall: { height: 26, fontSize: 12 } } },
      MuiTableContainer: { styleOverrides: { root: { borderRadius: 8, backgroundColor: surface, boxShadow: shadow } } },
      MuiTableHead: { styleOverrides: { root: { backgroundColor: soft } } },
      MuiTableCell: { styleOverrides: {
        root: { borderBottomColor: border, padding: "16px 20px", fontSize: 14 },
        head: { color: text, fontWeight: 600, whiteSpace: "nowrap", backgroundColor: soft },
        sizeSmall: { padding: "12px 16px" },
      } },
      MuiTablePagination: { styleOverrides: { toolbar: { minHeight: 64 } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8, backgroundColor: surface }, notchedOutline: { borderColor: dark ? "#64748B" : "#D1D5DB" } } },
      MuiInputLabel: { styleOverrides: { root: { fontSize: 14 } } },
      MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3 } } },
      MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 600, minHeight: 44 } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 12 } } },
      MuiDialogTitle: { styleOverrides: { root: { fontSize: 20, fontWeight: 600, borderBottom: `1px solid ${border}` } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 8 } } },
      MuiLinearProgress: { styleOverrides: { root: { borderRadius: 6, height: 8 }, bar: { borderRadius: 6 } } },
      MuiTooltip: { styleOverrides: { tooltip: { fontSize: 12, borderRadius: 6 } } },
    },
  });
};
