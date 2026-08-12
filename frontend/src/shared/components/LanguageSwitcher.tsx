import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Menu, MenuItem } from "@mui/material";
import LanguageIcon from "@mui/icons-material/Language";

import { LANGUAGES, setLanguage, type LanguageCode } from "@/app/i18n";

/**
 * Language picker (F-04).
 *
 * Two languages were registered in i18n but the app pinned `lng: "uz"` and
 * nothing ever called changeLanguage, so the Russian bundle was unreachable.
 */
export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const current = (i18n.resolvedLanguage as LanguageCode) ?? "uz";

  const choose = (code: LanguageCode) => {
    setLanguage(code);
    setAnchor(null);
  };

  return (
    <>
      <Button
        size="small"
        startIcon={<LanguageIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ color: "text.secondary", minWidth: 0 }}
      >
        {LANGUAGES[current]?.short ?? current.toUpperCase()}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => (
          <MenuItem key={code} selected={code === current} onClick={() => choose(code)}>
            {LANGUAGES[code].label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
