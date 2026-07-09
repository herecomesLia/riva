import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { Toaster } from "sonner"

import { i18n } from "@/i18n/i18n"
import { applyThemePreference, readThemePreference } from "@/app/theme"
import { TooltipProvider } from "@/components/ui/tooltip"

const queryClient = new QueryClient()

type AppProvidersProps = {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  useEffect(() => {
    function syncThemePreference() {
      applyThemePreference(readThemePreference())
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    syncThemePreference()
    mediaQuery.addEventListener("change", syncThemePreference)

    return () => {
      mediaQuery.removeEventListener("change", syncThemePreference)
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language

    function syncDocumentLanguage(language: string) {
      document.documentElement.lang = language
    }

    i18n.on("languageChanged", syncDocumentLanguage)

    return () => {
      i18n.off("languageChanged", syncDocumentLanguage)
    }
  }, [])

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
