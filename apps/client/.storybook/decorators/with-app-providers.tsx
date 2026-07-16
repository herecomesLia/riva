import type { Decorator } from "@storybook/tanstack-react"
import { QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { Toaster } from "sonner"

import { applyThemePreference } from "@/app/theme"
import { TooltipProvider } from "@/components/ui/tooltip"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage, supportedLanguages, type SupportedLanguage } from "@/i18n/resources"
import { createTestQueryClient } from "@/test/query-client"

type StoryTheme = "light" | "dark"

type StoryEnvironmentProps = {
  children: ReactNode
  locale: SupportedLanguage
  theme: StoryTheme
}

function resolveLocale(value: unknown): SupportedLanguage {
  return supportedLanguages.includes(value as SupportedLanguage)
    ? (value as SupportedLanguage)
    : defaultLanguage
}

function resolveTheme(value: unknown): StoryTheme {
  return value === "dark" ? "dark" : "light"
}

function StoryEnvironment({ children, locale, theme }: StoryEnvironmentProps) {
  const [queryClient] = useState(createTestQueryClient)

  useEffect(() => {
    document.documentElement.lang = locale
    void i18n.changeLanguage(locale)
  }, [locale])

  useEffect(() => {
    applyThemePreference(theme)
  }, [theme])

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

export const withAppProviders: Decorator = (Story, context) => {
  const locale = resolveLocale(context.globals.locale)
  const theme = resolveTheme(context.globals.theme)

  return (
    <StoryEnvironment key={context.id} locale={locale} theme={theme}>
      <Story />
    </StoryEnvironment>
  )
}
