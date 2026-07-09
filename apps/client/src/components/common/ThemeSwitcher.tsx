import { CheckIcon, LaptopIcon, MoonIcon, PaletteIcon, SunIcon } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import {
  readThemePreference,
  themePreferenceChangeEvent,
  writeThemePreference,
  type ThemePreference,
} from "@/app/theme"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePreferencesStore } from "@/stores/preferences"

const themeOptions: Array<{
  icon: typeof SunIcon
  labelKey: string
  value: ThemePreference
}> = [
  {
    icon: LaptopIcon,
    labelKey: "appShell.theme.options.system",
    value: "system",
  },
  {
    icon: SunIcon,
    labelKey: "appShell.theme.options.light",
    value: "light",
  },
  {
    icon: MoonIcon,
    labelKey: "appShell.theme.options.dark",
    value: "dark",
  },
]

export function ThemeSwitcher() {
  const themePreference = usePreferencesStore((state) => state.themePreference)
  const setThemePreference = usePreferencesStore((state) => state.setThemePreference)
  const { t } = useTranslation()

  useEffect(() => {
    setThemePreference(readThemePreference())

    function handleThemePreferenceChange(event: Event) {
      setThemePreference((event as CustomEvent<ThemePreference>).detail)
    }

    window.addEventListener(themePreferenceChangeEvent, handleThemePreferenceChange)

    return () => {
      window.removeEventListener(themePreferenceChangeEvent, handleThemePreferenceChange)
    }
  }, [setThemePreference])

  function handleThemeChange(preference: ThemePreference) {
    setThemePreference(preference)
    writeThemePreference(preference)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label={t("appShell.theme.select")} size="icon-sm" variant="ghost" />}
      >
        <PaletteIcon data-icon="inline-start" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("appShell.theme.label")}</DropdownMenuLabel>
          {themeOptions.map((option) => {
            const Icon = option.icon

            return (
              <DropdownMenuItem key={option.value} onClick={() => handleThemeChange(option.value)}>
                <Icon data-icon="inline-start" />
                {t(option.labelKey)}
                {option.value === themePreference && (
                  <CheckIcon data-icon="inline-end" className="ml-auto" />
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
