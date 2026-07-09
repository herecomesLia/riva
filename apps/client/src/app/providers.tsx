import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { Toaster } from "sonner"

import { i18n } from "@/i18n/i18n"
import { applyThemePreference, readThemePreference } from "@/app/theme"
import { TooltipProvider } from "@/components/ui/tooltip"
import { normalizeLanguagePreference, usePreferencesStore } from "@/stores/preferences.store"

const queryClient = new QueryClient()

type AppProvidersProps = {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  const setLanguage = usePreferencesStore((state) => state.setLanguage)
  const setThemePreference = usePreferencesStore((state) => state.setThemePreference)

  useEffect(() => {
    function syncThemePreference() {
      const themePreference = readThemePreference()

      setThemePreference(themePreference)
      applyThemePreference(themePreference)
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    syncThemePreference()
    mediaQuery.addEventListener("change", syncThemePreference)

    return () => {
      mediaQuery.removeEventListener("change", syncThemePreference)
    }
  }, [setThemePreference])

  useEffect(() => {
    const initialLanguage = normalizeLanguagePreference(i18n.resolvedLanguage ?? i18n.language)

    document.documentElement.lang = initialLanguage
    setLanguage(initialLanguage)

    function syncDocumentLanguage(language: string) {
      const languagePreference = normalizeLanguagePreference(language)

      document.documentElement.lang = languagePreference
      setLanguage(languagePreference)
    }

    i18n.on("languageChanged", syncDocumentLanguage)

    return () => {
      i18n.off("languageChanged", syncDocumentLanguage)
    }
  }, [setLanguage])

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          <Toaster position="top-center" richColors />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  )
}
