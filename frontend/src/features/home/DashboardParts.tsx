import type { ReactNode } from "react";
import { alpha } from "@mui/material/styles";
import { Box, Button, Skeleton, Stack, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

export function StatTile({ label, value, hint, icon, color, loading, onClick }: {
  label: string; value: number | null; hint: string; icon: ReactNode; color: string; loading?: boolean; onClick?: () => void;
}) {
  return (
    <Box component={onClick ? "button" : "div"} onClick={onClick} type={onClick ? "button" : undefined}
      sx={{ display: "flex", flexDirection: "column", textAlign: "left", fontFamily: "inherit", width: "100%", minWidth: 0, minHeight: 170, border: 0, borderRadius: "8px", p: 2.5, color: "text.primary", cursor: onClick ? "pointer" : "default",
        background: (theme) => `linear-gradient(120deg, ${theme.palette.background.paper}, ${alpha(color, theme.palette.mode === "dark" ? 0.17 : 0.1)})`,
        boxShadow: "0 4px 30px rgba(46,45,116,0.05)", transition: "box-shadow .15s ease",
        "&:hover": onClick ? { boxShadow: `0 6px 24px ${alpha(color, 0.16)}` } : undefined,
        "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 3 },
      }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: "50%", bgcolor: color, color: "#fff", display: "grid", placeItems: "center" }}>{icon}</Box>
        <Typography variant="body2" fontWeight={500}>{label}</Typography>
      </Stack>
      {loading ? <Skeleton width={70} height={32} /> : <Typography variant="h4" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>{value === null ? "—" : value.toLocaleString()}</Typography>}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>{hint}</Typography>
    </Box>
  );
}

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}
      sx={{ px: 2.5, py: 1.75, borderBottom: "1px solid", borderColor: "divider" }}>
      <Typography variant="h6">{title}</Typography>
      <Button onClick={onAction} size="small" endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />} sx={{ flexShrink: 0 }}>{actionLabel}</Button>
    </Stack>
  );
}
