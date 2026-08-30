import type { TargetRole } from "@/models/roles"

export type TargetRoleListCategory = "active" | "archived"

export function getRolesForCategory(
  roles: TargetRole[],
  category: TargetRoleListCategory,
): TargetRole[] {
  return roles.filter((role) =>
    category === "archived" ? role.status === "archived" : role.status !== "archived",
  )
}
