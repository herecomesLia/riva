export type ThemePreference = "light" | "dark" | "system"

const themeStorageKey = "riva-theme"

export const defaultThemePreference: ThemePreference = "system"

export const themePreferenceChangeEvent = "riva:theme-preference-change"

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system"
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return defaultThemePreference
  }

  const storedPreference = window.localStorage.getItem(themeStorageKey)

  return isThemePreference(storedPreference) ? storedPreference : defaultThemePreference
}

export function resolveThemePreference(preference: ThemePreference) {
  if (preference !== "system") {
    return preference
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function applyThemePreference(preference: ThemePreference) {
  const resolvedTheme = resolveThemePreference(preference)

  document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
  document.documentElement.dataset.theme = preference
  document.documentElement.style.colorScheme = resolvedTheme
}

export function writeThemePreference(preference: ThemePreference) {
  window.localStorage.setItem(themeStorageKey, preference)
  applyThemePreference(preference)
  window.dispatchEvent(
    new CustomEvent<ThemePreference>(themePreferenceChangeEvent, {
      detail: preference,
    }),
  )
}
