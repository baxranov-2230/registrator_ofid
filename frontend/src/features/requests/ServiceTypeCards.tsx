import { useTranslation } from "react-i18next";
import { Box, ButtonBase, Chip, Skeleton, Stack, Typography } from "@mui/material";
import SchoolIcon from "@mui/icons-material/School";
import Diversity3Icon from "@mui/icons-material/Diversity3";
import PublicIcon from "@mui/icons-material/Public";
import PaymentsIcon from "@mui/icons-material/Payments";
import ScienceIcon from "@mui/icons-material/Science";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import type { SvgIconComponent } from "@mui/icons-material";

import type { CategoryNode } from "@/features/admin/adminApi";

/**
 * The seeded `icon` column holds Material Symbol names. Mapping them here keeps
 * the catalogue data free of frontend concerns, and an unknown name degrades to
 * a neutral glyph rather than breaking the grid.
 */
const ICONS: Record<string, SvgIconComponent> = {
  school: SchoolIcon,
  diversity_3: Diversity3Icon,
  public: PublicIcon,
  payments: PaymentsIcon,
  science: ScienceIcon,
  more_horiz: MoreHorizIcon,
};

interface Props {
  types: CategoryNode[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}

/**
 * Service types as tappable cards rather than a dropdown.
 *
 * There are only six, each is a broad category the student must recognise, and
 * on a phone a 44px+ card is a far easier target than a select popover. The
 * grid is driven by `auto-fit` so it collapses to one column at 320px without
 * any breakpoint bookkeeping.
 */
export default function ServiceTypeCards({
  types,
  selectedId,
  onSelect,
  loading,
}: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} variant="rounded" height={92} sx={{ borderRadius: 3 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box
      role="radiogroup"
      aria-label={t("requests.serviceType")}
      sx={{
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
      }}
    >
      {types.map((type) => {
        const selected = String(type.id) === selectedId;
        const Icon = (type.icon && ICONS[type.icon]) || MoreHorizIcon;
        const count = type.children.filter((c) => c.is_active).length;

        return (
          <ButtonBase
            key={type.id}
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(String(type.id))}
            sx={{
              justifyContent: "flex-start",
              alignItems: "flex-start",
              textAlign: "left",
              p: 2,
              borderRadius: 3,
              height: "100%",
              border: "1.5px solid",
              borderColor: selected ? "primary.main" : "divider",
              bgcolor: selected ? "rgba(79, 70, 229, 0.04)" : "background.paper",
              transition: "border-color .15s, background-color .15s, transform .15s",
              "&:hover": {
                borderColor: selected ? "primary.main" : "primary.light",
                bgcolor: selected ? "rgba(79, 70, 229, 0.06)" : "rgba(79, 70, 229, 0.02)",
              },
              // Keyboard focus must stay visible — this replaces a native input.
              "&.Mui-focusVisible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: 2,
              },
              "&:active": { transform: "scale(0.99)" },
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ width: "100%", minWidth: 0 }}>
              <Box
                sx={{
                  flexShrink: 0,
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: selected ? "primary.main" : "rgba(79, 70, 229, 0.08)",
                  color: selected ? "primary.contrastText" : "primary.main",
                  transition: "background-color .15s, color .15s",
                }}
              >
                <Icon fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ lineHeight: 1.35, color: "text.primary" }}
                >
                  {type.name}
                </Typography>
                <Chip
                  label={t("requests.serviceCount", { count })}
                  size="small"
                  sx={{
                    mt: 0.75,
                    height: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    bgcolor: "transparent",
                    border: "1px solid",
                    borderColor: "divider",
                    color: "text.secondary",
                  }}
                />
              </Box>
            </Stack>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
