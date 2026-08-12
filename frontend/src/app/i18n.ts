import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import uz from "@/shared/i18n/uz.json";
import ru from "@/shared/i18n/ru.json";

export const LANGUAGES = {
  uz: { label: "O'zbekcha", short: "UZ" },
  ru: { label: "Русский", short: "RU" },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

const STORAGE_KEY = "royd_lang";

function initialLanguage(): LanguageCode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved in LANGUAGES) return saved as LanguageCode;
  const browser = navigator.language.slice(0, 2);
  return browser in LANGUAGES ? (browser as LanguageCode) : "uz";
}

i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: uz },
    ru: { translation: ru },
  },
  lng: initialLanguage(),
  fallbackLng: "uz",
  interpolation: { escapeValue: false },
});

/** Change language and remember the choice across sessions. */
export function setLanguage(code: LanguageCode): void {
  localStorage.setItem(STORAGE_KEY, code);
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
}

document.documentElement.lang = i18n.language;

export default i18n;
