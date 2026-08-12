import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BottomNavigation, BottomNavigationAction, Paper } from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";

import { isNavActive, navItemsFor } from "@/shared/navItems";

/** Room for four labelled tabs at 320px; the rest live behind "More". */
const MAX_TABS = 4;

interface Props {
  role: string;
  /** Opens the full menu drawer for anything that does not fit. */
  onMore: () => void;
}

/**
 * Phone navigation, pinned to the bottom of the viewport.
 *
 * On a phone the primary destinations belong within thumb reach rather than
 * behind a hamburger at the top of the screen. Roles with more entries than fit
 * (admin has eight) keep their first three here and reach the remainder through
 * "More", which opens the same drawer.
 */
export default function BottomNav({ role, onMore }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const items = navItemsFor(role);
  const overflow = items.length > MAX_TABS;
  const visible = overflow ? items.slice(0, MAX_TABS - 1) : items;

  const activeIndex = visible.findIndex((i) => isNavActive(location.pathname, i.to, role));

  return (
    <Paper
      elevation={0}
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        borderTop: "1px solid",
        borderColor: "divider",
        borderRadius: 0,
        // Clears the iOS home indicator so the last row stays tappable.
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      <BottomNavigation
        showLabels
        value={activeIndex === -1 ? false : activeIndex}
        sx={{
          height: 60,
          "& .MuiBottomNavigationAction-root": {
            minWidth: 0,
            px: 0.5,
          },
          "& .MuiBottomNavigationAction-label": {
            fontSize: 11,
            lineHeight: 1.2,
            textAlign: "center",
            "&.Mui-selected": { fontSize: 11 },
          },
        }}
      >
        {visible.map((item) => (
          <BottomNavigationAction
            key={item.to}
            label={t(item.label)}
            icon={item.icon}
            onClick={() => navigate(item.to)}
          />
        ))}
        {overflow && (
          <BottomNavigationAction
            label={t("nav.more")}
            icon={<MoreHorizIcon />}
            onClick={onMore}
          />
        )}
      </BottomNavigation>
    </Paper>
  );
}
