import type { TargetRole } from "@/models/roles"

export type TargetRoleListCategory = "saved" | "archived"

export function getRolesForCategory(
  roles: TargetRole[],
  category: TargetRoleListCategory,
): TargetRole[] {
  return roles.filter((role) =>
    category === "archived"
      ? role.preparationStatus === "archived"
      : role.preparationStatus !== "archived",
  )
}
