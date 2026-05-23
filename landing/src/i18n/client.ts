import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE, resources, SUPPORTED_LANGUAGES } from "@/i18n/config";

if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        lookupLocalStorage: "clovapi-lang",
        caches: ["localStorage"],
      },
    });
}

void i18n.on("languageChanged", (lang) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
});

export default i18n;
