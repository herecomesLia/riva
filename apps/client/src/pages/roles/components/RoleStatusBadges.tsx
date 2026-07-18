import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { TargetRole } from "@/models/roles"

export function RoleStatusBadges({ role }: { role: TargetRole }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap gap-2">
      {role.isCurrent && <Badge>{t("roles.badges.current")}</Badge>}
      <Badge variant={preparationStatusVariant[role.preparationStatus]}>
        {t(`roles.preparationStatus.${role.preparationStatus}`)}
      </Badge>
    </div>
  )
}

const preparationStatusVariant = {
  preparing: "secondary",
  paused: "outline",
  archived: "ghost",
} as const
