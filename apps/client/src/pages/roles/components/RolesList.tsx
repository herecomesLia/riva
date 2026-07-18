import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { TargetRole } from "@/models/roles"

import { RoleStatusBadges } from "./RoleStatusBadges"

export function RolesList({
  roles,
  selectedRoleId,
  onSelectRole,
}: {
  roles: TargetRole[]
  selectedRoleId: string | null
  onSelectRole: (roleId: string) => void
}) {
  const { t } = useTranslation()

  return (
    <Card className="h-fit" data-testid="roles-list-card">
      <CardHeader>
        <CardTitle>
          <h2>{t("roles.list.title")}</h2>
        </CardTitle>
        <CardDescription>{t("roles.list.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div aria-label={t("roles.list.title")} className="flex flex-col gap-2" role="list">
          {roles.map((role) => (
            <div key={role.id} role="listitem">
              <Button
                aria-pressed={selectedRoleId === role.id}
                className="h-auto w-full justify-start p-3 text-left whitespace-normal"
                onClick={() => onSelectRole(role.id)}
                variant={selectedRoleId === role.id ? "secondary" : "ghost"}
              >
                <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <span className="w-full truncate font-medium">{role.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {role.company ?? t("roles.fallbackValue")}
                  </span>
                  <RoleStatusBadges role={role} />
                </span>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
