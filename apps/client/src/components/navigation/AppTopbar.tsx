import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "@/components/common/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/common/ThemeSwitcher"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function AppTopbar() {
  const { i18n, t } = useTranslation()
  const today = new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(new Date())

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b bg-card px-4 md:pr-8 lg:pr-10">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger aria-label={t("appShell.openNavigation")} className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <h1 className="truncate text-sm font-medium text-muted-foreground">{today}</h1>
      </div>
      <div className="flex items-center gap-2">
        <Badge className="hidden sm:inline-flex" variant="secondary">
          {t("appShell.preview")}
        </Badge>
        <ThemeSwitcher />
        <LanguageSwitcher />
      </div>
    </header>
  )
}
