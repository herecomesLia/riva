import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TargetRole } from "@/models/roles"

import { RoleStatusBadges } from "./RoleStatusBadges"

export function MobileTargetRoleSelector({
  onSelectRole,
  roles,
  selectedRole,
}: {
  onSelectRole: (roleId: string) => void
  roles: TargetRole[]
  selectedRole: TargetRole
}) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2 lg:hidden" data-testid="mobile-role-selector">
      <h2 className="text-sm font-medium">{t("roles.mobileSelector.label")}</h2>
      <Select onValueChange={(value) => value && onSelectRole(value)} value={selectedRole.id}>
        <SelectTrigger
          aria-label={t("roles.mobileSelector.label")}
          className="h-auto min-h-11 w-full py-2"
          data-testid="mobile-role-selector-trigger"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectGroup>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                <span className="flex min-w-0 flex-col items-start gap-1.5 py-1">
                  <span className="max-w-56 truncate font-medium">{role.title}</span>
                  <RoleStatusBadges role={role} />
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </section>
  )
}
