import { BriefcaseBusinessIcon, LogOutIcon, PanelLeftIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"

import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function TopBar() {
  const { t } = useTranslation()

  return (
    <header className="sticky top-0 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link className="flex items-center gap-2 font-heading text-sm font-medium" to="/dashboard">
          <BriefcaseBusinessIcon data-icon="inline-start" />
          {t("app.name")}
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t("appShell.preview")}</Badge>
          <LanguageSwitcher />
          <Button variant="ghost" size="icon-sm" aria-label={t("appShell.openNavigation")}>
            <PanelLeftIcon />
          </Button>
          <Button nativeButton={false} variant="outline" size="sm" render={<Link to="/login" />}>
            <LogOutIcon data-icon="inline-start" />
            {t("appShell.signOut")}
          </Button>
        </div>
      </div>
    </header>
  )
}
