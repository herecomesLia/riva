import { create } from "zustand"

import { defaultThemePreference, type ThemePreference } from "@/app/theme"
import { normalizeInteractionLanguage } from "@/i18n/language"
import { defaultLanguage, type SupportedLanguage } from "@/i18n/resources"

type PreferencesState = {
  language: SupportedLanguage
  setLanguage: (language: SupportedLanguage) => void
  setThemePreference: (themePreference: ThemePreference) => void
  themePreference: ThemePreference
}

export function normalizeLanguagePreference(language: string | undefined): SupportedLanguage {
  return normalizeInteractionLanguage(language)
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
