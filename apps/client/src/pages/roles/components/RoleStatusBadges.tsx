import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { RoleView } from "@/models/target-role-workflow"

export function RoleStatusBadges({ isCurrent, role }: { isCurrent: boolean; role: RoleView }) {
  const { t } = useTranslation()
  const status = role.isArchived ? "archived" : "active"

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="role-status-badges">
      {isCurrent && (
        <Badge className="bg-primary text-primary-foreground" data-role-status="current">
          {t("roles.badges.current")}
        </Badge>
      )}
      <Badge
        className={cn(
          role.isArchived
            ? "border-border bg-muted text-muted-foreground"
            : "border-primary/20 bg-primary/10 text-primary",
        )}
        data-role-status={status}
        variant="outline"
      >
        {t(`roles.status.${status}`)}
      </Badge>
    </div>
  )
}
