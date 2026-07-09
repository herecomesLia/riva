import { CheckIcon, LanguagesIcon } from "lucide-react"
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
import { defaultLanguage, supportedLanguages, type SupportedLanguage } from "@/i18n/resources"

function normalizeLanguage(language: string | undefined): SupportedLanguage {
  if (language === "en") {
    return "en"
  }

  return defaultLanguage
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const currentLanguage =
    supportedLanguages.find((language) => language === i18n.resolvedLanguage) ??
    supportedLanguages.find((language) => language === i18n.language) ??
    normalizeLanguage(i18n.resolvedLanguage ?? i18n.language)

  function handleLanguageChange(language: SupportedLanguage) {
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
          <Button
            aria-label={t("appShell.language.select")}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <LanguagesIcon data-icon="inline-start" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("appShell.language.label")}</DropdownMenuLabel>
          {supportedLanguages.map((language) => (
            <DropdownMenuItem
              key={language}
              onClick={() => handleLanguageChange(language)}
            >
              {getLanguageLabel(language)}
              {language === currentLanguage && <CheckIcon data-icon="inline-end" className="ml-auto" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
