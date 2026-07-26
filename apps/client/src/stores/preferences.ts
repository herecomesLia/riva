import { create } from "zustand"

import { defaultThemePreference, type ThemePreference } from "@/app/theme"
import { defaultLanguage, supportedLanguages, type SupportedLanguage } from "@/i18n/resources"

type PreferencesState = {
  language: SupportedLanguage
  setLanguage: (language: SupportedLanguage) => void
  setThemePreference: (themePreference: ThemePreference) => void
  themePreference: ThemePreference
}

export function normalizeLanguagePreference(language: string | undefined): SupportedLanguage {
  if (language === "zh") {
    return defaultLanguage
  }

  return supportedLanguages.includes(language as SupportedLanguage)
    ? (language as SupportedLanguage)
    : defaultLanguage
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  language: defaultLanguage,
  setLanguage: (language) => {
    set({ language })
  },
  setThemePreference: (themePreference) => {
    set({ themePreference })
  },
  themePreference: defaultThemePreference,
}))
