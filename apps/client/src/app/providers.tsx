import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { Toaster } from "sonner"

import { i18n } from "@/i18n/i18n"

const queryClient = new QueryClient()

type AppProvidersProps = {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
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
        {children}
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </I18nextProvider>
  )
}
