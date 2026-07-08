import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import { defaultLanguage, i18nSupportedLanguages, resources } from "./resources"

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    defaultNS: "translation",
    detection: {
      caches: ["localStorage"],
      order: ["localStorage", "navigator", "htmlTag"],
    },
    fallbackLng: {
      default: [defaultLanguage],
      zh: [defaultLanguage],
    },
    interpolation: {
      escapeValue: false,
    },
    nonExplicitSupportedLngs: true,
    resources,
    supportedLngs: i18nSupportedLanguages,
  })

export { i18n }
