import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import uz from "@/shared/i18n/uz.json";
import ru from "@/shared/i18n/ru.json";

i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: uz },
    ru: { translation: ru },
  },
  lng: "uz",
  fallbackLng: "uz",
  interpolation: { escapeValue: false },
});

export default i18n;
