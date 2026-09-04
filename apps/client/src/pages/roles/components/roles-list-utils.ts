import type { RoleView } from "@/models/target-role-workflow"

export type TargetRoleListCategory = "active" | "archived"

export function getRolesForCategory(
  roles: RoleView[],
  category: TargetRoleListCategory,
): RoleView[] {
  return roles.filter((role) => (category === "archived" ? role.isArchived : !role.isArchived))
}
