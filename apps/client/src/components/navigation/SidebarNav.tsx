import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"

const navItems = [
  {
    labelKey: "appShell.nav.dashboard",
    to: "/dashboard",
  },
]

export function SidebarNav() {
  const { t } = useTranslation()

  return (
    <aside className="hidden md:block">
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Button
            className="w-full justify-start text-muted-foreground"
            key={item.to}
            nativeButton={false}
            render={
              <Link
                activeProps={{
                  className: "bg-secondary text-secondary-foreground",
                }}
                to={item.to}
              />
            }
            size="sm"
            variant="ghost"
          >
            {t(item.labelKey)}
          </Button>
        ))}
      </nav>
    </aside>
  )
}
