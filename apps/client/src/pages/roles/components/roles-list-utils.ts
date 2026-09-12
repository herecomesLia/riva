import type { RoleResponse } from "@/api/generated/models"

export type RoleListCategory = "active" | "archived"

export function getRolesForCategory(
  roles: RoleResponse[],
  category: RoleListCategory,
): RoleResponse[] {
  return roles.filter((role) => (category === "archived" ? role.isArchived : !role.isArchived))
}
