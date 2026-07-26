import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
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
import { getRolesForCategory, type TargetRoleListCategory } from "./roles-list-utils"

export function MobileTargetRoleSelector({
  category,
  currentRoleId,
  onCategoryChange,
  onSelectRole,
  roles,
  selectedRole,
}: {
  category: TargetRoleListCategory
  currentRoleId: string | null
  onCategoryChange: (category: TargetRoleListCategory) => void
  onSelectRole: (roleId: string) => void
  roles: TargetRole[]
  selectedRole: TargetRole | null
}) {
  const { t } = useTranslation()
  const savedCount = getRolesForCategory(roles, "saved").length
  const archivedCount = getRolesForCategory(roles, "archived").length
  const visibleRoles = getRolesForCategory(roles, category)

  return (
    <section className="flex flex-col gap-2 lg:hidden" data-testid="mobile-role-selector">
      <h2 className="text-sm font-medium">{t("roles.mobileSelector.label")}</h2>
      <div
        aria-label={t("roles.list.categoryLabel")}
        className="flex items-center gap-2"
        role="tablist"
      >
        <Button
          aria-selected={category === "saved"}
          className="h-6 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-primary/[0.08] hover:text-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
          data-active={category === "saved"}
          onClick={() => onCategoryChange("saved")}
          role="tab"
          variant="ghost"
        >
          {t("roles.list.categories.saved", { count: savedCount })}
        </Button>
        <Button
          aria-selected={category === "archived"}
          className="h-6 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-primary/[0.08] hover:text-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
          data-active={category === "archived"}
          onClick={() => onCategoryChange("archived")}
          role="tab"
          variant="ghost"
        >
          {t("roles.list.categories.archived", { count: archivedCount })}
        </Button>
      </div>
      {selectedRole ? (
        <Select onValueChange={(value) => value && onSelectRole(value)} value={selectedRole.id}>
          <SelectTrigger
            aria-label={t("roles.mobileSelector.label")}
            className="h-auto min-h-11 w-full py-2"
            data-testid="mobile-role-selector-trigger"
          >
            <SelectValue>{selectedRole.title}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              {visibleRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  <span className="flex min-w-0 flex-col items-start gap-1.5 py-1">
                    <span className="max-w-56 truncate font-medium">{role.title}</span>
                    <RoleStatusBadges isCurrent={role.id === currentRoleId} role={role} />
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
          {t(`roles.list.empty.${category}`)}
        </p>
      )}
    </section>
  )
}
