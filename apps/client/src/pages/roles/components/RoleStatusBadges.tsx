import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { TargetRole } from "@/models/roles"

export function RoleStatusBadges({ role }: { role: TargetRole }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="role-status-badges">
      {role.isCurrent && (
        <Badge className="bg-primary text-primary-foreground" data-role-status="current">
          {t("roles.badges.current")}
        </Badge>
      )}
      <Badge
        className={cn(
          role.preparationStatus === "archived"
            ? "border-border bg-muted text-muted-foreground"
            : "border-primary/20 bg-primary/10 text-primary",
        )}
        data-role-status={role.preparationStatus}
        variant={preparationStatusVariant[role.preparationStatus]}
      >
        {t(`roles.preparationStatus.${role.preparationStatus}`)}
      </Badge>
    </div>
  )
}

const preparationStatusVariant = {
  preparing: "outline",
  paused: "outline",
  archived: "outline",
} as const
