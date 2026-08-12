import { Box, ButtonBase, Skeleton, Stack, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

/** Tinted stat tile, matching the four counters across the top of the page. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  color,
  loading,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={!onClick}
      sx={{
        display: "block",
        textAlign: "left",
        width: "100%",
        height: "100%",
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        p: { xs: 1.75, sm: 2.5 },
        transition: "border-color .15s, box-shadow .15s, transform .15s",
        "&:hover": onClick
          ? {
              borderColor: color,
              boxShadow: `0 6px 18px ${color}22`,
              transform: "translateY(-2px)",
            }
          : undefined,
        "&.Mui-focusVisible": { outline: "2px solid", outlineColor: color, outlineOffset: 2 },
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 1, sm: 2 }}
        alignItems={{ xs: "flex-start", sm: "center" }}
      >
        <Box
          sx={{
            width: { xs: 40, sm: 52 },
            height: { xs: 40, sm: 52 },
            flexShrink: 0,
            borderRadius: 2.5,
            display: "grid",
            placeItems: "center",
            bgcolor: `${color}14`,
            color,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {label}
          </Typography>
          {loading ? (
            <Skeleton width={40} height={36} />
          ) : (
            <Typography variant="h5" fontWeight={800} lineHeight={1.2}>
              {value}
            </Typography>
          )}
          <Typography variant="caption" color="text.disabled" noWrap display="block">
            {hint}
          </Typography>
        </Box>
      </Stack>
    </ButtonBase>
  );
}

/** Section title with a "view all" affordance on the right. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={1}
      sx={{ mb: 2 }}
    >
      <Typography
        variant="h6"
        fontWeight={700}
        sx={{ fontSize: { xs: "1rem", sm: "1.25rem" }, minWidth: 0 }}
      >
        {title}
      </Typography>
      <ButtonBase
        onClick={onAction}
        sx={{
          borderRadius: 1.5,
          px: 1,
          py: 0.5,
          color: "primary.main",
          fontWeight: 600,
          fontSize: 14,
          gap: 0.5,
          flexShrink: 0,
        }}
      >
        {actionLabel}
        <ArrowForwardIcon sx={{ fontSize: 16 }} />
      </ButtonBase>
    </Stack>
  );
}
