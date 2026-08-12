import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  ButtonBase,
  InputAdornment,
  Radio,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

import type { CategoryNode } from "@/features/admin/adminApi";

interface Props {
  services: CategoryNode[];
  selectedId: string;
  onSelect: (id: string) => void;
  error?: boolean;
}

/** Case- and apostrophe-insensitive match: users type ' where data has ‘. */
function normalise(value: string): string {
  return value.toLowerCase().replace(/['‘’`]/g, "'");
}

/**
 * The services of the chosen type, as a scrollable single-choice list.
 *
 * The largest type holds 30 items, so the list is capped in height and gets a
 * filter box once it is long enough to be worth searching. Rows wrap instead of
 * truncating — several service names are a full sentence, and an ellipsis would
 * hide the very words that distinguish them.
 */
export default function ServicePicker({
  services,
  selectedId,
  onSelect,
  error,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const showSearch = services.length > 8;

  const filtered = useMemo(() => {
    const q = normalise(query.trim());
    if (!q) return services;
    return services.filter((s) => normalise(s.name).includes(q));
  }, [services, query]);

  return (
    <Box>
      {showSearch && (
        <TextField
          size="small"
          fullWidth
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("requests.serviceSearchPlaceholder")}
          sx={{ mb: 1.5 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      )}

      <Box
        role="radiogroup"
        aria-label={t("requests.service")}
        sx={{
          border: "1.5px solid",
          borderColor: error ? "error.main" : "divider",
          borderRadius: 3,
          overflow: "hidden",
          // Caps the list so the submit button stays reachable on a phone,
          // while the page itself never scrolls sideways.
          maxHeight: { xs: 320, md: 360 },
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
      >
        {filtered.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ p: 2.5, textAlign: "center" }}
          >
            {t("requests.serviceNoMatch")}
          </Typography>
        )}

        {filtered.map((service, i) => {
          const selected = String(service.id) === selectedId;
          return (
            <ButtonBase
              key={service.id}
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(String(service.id))}
              sx={{
                width: "100%",
                justifyContent: "flex-start",
                textAlign: "left",
                px: 1.5,
                py: 1.5,
                gap: 1,
                borderTop: i === 0 ? "none" : "1px solid",
                borderColor: "divider",
                bgcolor: selected ? "rgba(79, 70, 229, 0.06)" : "transparent",
                transition: "background-color .12s",
                "&:hover": {
                  bgcolor: selected ? "rgba(79, 70, 229, 0.09)" : "action.hover",
                },
                "&.Mui-focusVisible": {
                  outline: "2px solid",
                  outlineColor: "primary.main",
                  outlineOffset: -2,
                },
              }}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ width: "100%" }}>
                <Radio
                  checked={selected}
                  size="small"
                  tabIndex={-1}
                  sx={{ p: 0, mt: 0.25, flexShrink: 0 }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    lineHeight: 1.45,
                    fontWeight: selected ? 600 : 400,
                    color: selected ? "primary.main" : "text.primary",
                    // Long service names wrap rather than overflow the row.
                    overflowWrap: "anywhere",
                  }}
                >
                  {service.name}
                </Typography>
              </Stack>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
