import { CheckIcon, LanguagesIcon } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { supportedLanguages, type SupportedLanguage } from "@/i18n/resources"
import { normalizeLanguagePreference, usePreferencesStore } from "@/stores/preferences"

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const currentLanguage = usePreferencesStore((state) => state.language)
  const setLanguage = usePreferencesStore((state) => state.setLanguage)

  useEffect(() => {
    setLanguage(normalizeLanguagePreference(i18n.resolvedLanguage ?? i18n.language))

    function handleLanguageChanged(language: string) {
      setLanguage(normalizeLanguagePreference(language))
    }

    i18n.on("languageChanged", handleLanguageChanged)

    return () => {
      i18n.off("languageChanged", handleLanguageChanged)
    }
  }, [i18n, setLanguage])

  function handleLanguageChange(language: SupportedLanguage) {
    setLanguage(language)
    void i18n.changeLanguage(language)
  }

  function getLanguageLabel(language: SupportedLanguage) {
    return language === "zh-CN"
      ? t("appShell.language.options.zhCN")
      : t("appShell.language.options.en")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label={t("appShell.language.select")} size="icon-sm" variant="ghost" />
        }
      >
        <LanguagesIcon data-icon="inline-start" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("appShell.language.label")}</DropdownMenuLabel>
          {supportedLanguages.map((language) => (
            <DropdownMenuItem key={language} onClick={() => handleLanguageChange(language)}>
              {getLanguageLabel(language)}
              {language === currentLanguage && (
                <CheckIcon data-icon="inline-end" className="ml-auto" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
