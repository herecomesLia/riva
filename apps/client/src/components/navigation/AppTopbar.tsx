import { useLocation } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "@/components/common/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/common/ThemeSwitcher"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const pageTitleKeys = [
  {
    labelKey: "appShell.nav.dashboard",
    to: "/dashboard",
  },
  {
    labelKey: "appShell.nav.profile",
    to: "/profile",
  },
  {
    labelKey: "appShell.nav.roles",
    to: "/roles",
  },
  {
    labelKey: "appShell.nav.practice",
    to: "/practice",
  },
  {
    labelKey: "appShell.nav.interview",
    to: "/interview",
  },
  {
    labelKey: "appShell.nav.history",
    to: "/history",
  },
]

export function AppTopbar() {
  const location = useLocation()
  const { t } = useTranslation()
  const activeItem = pageTitleKeys.find((item) => item.to === location.pathname)
  const title = activeItem ? t(activeItem.labelKey) : t("app.name")

  return (
    <header className="sticky top-0 flex h-14 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger aria-label={t("appShell.openNavigation")} className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
        <h1 className="truncate font-heading text-sm font-medium">{title}</h1>
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
