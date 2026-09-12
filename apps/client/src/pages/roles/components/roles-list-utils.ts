import type { TargetRoleResponse } from "@/api/generated/models"

export type TargetRoleListCategory = "active" | "archived"

export function getRolesForCategory(
  roles: TargetRoleResponse[],
  category: TargetRoleListCategory,
): TargetRoleResponse[] {
  return roles.filter((role) => (category === "archived" ? role.isArchived : !role.isArchived))
}
