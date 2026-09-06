import { dashboardFixture } from "@/mocks/fixtures/dashboard"
import type { DashboardResponse } from "@/models/dashboard"
import type { RoleView } from "@/models/target-role-workflow"
import { getRoles } from "@/services/roles"

function toCurrentRole(
  role: RoleView | null,
  profileCompleted: boolean,
): DashboardResponse["currentRole"] {
  if (role === null) return null
  return {
    id: role.id,
    title: role.title,
    company: role.company,
    recruitmentType: role.recruitmentTrack,
    location: role.location,
    profileCompleted,
    jobDescriptionAdded: role.jdState.status !== "missing",
  }
}

function toRoleFit(role: RoleView | null): DashboardResponse["metrics"]["roleFit"] {
  return {
    currentValue:
      role?.matchState.status === "current" ? role.matchState.result.overallMatchScore : null,
    previousValue: null,
  }
}

export async function getDashboardData(): Promise<DashboardResponse> {
  const roles = await getRoles()
  const currentRole = roles.activeRoleId
    ? (roles.roles.find(({ id }) => id === roles.activeRoleId) ?? null)
    : null
  const fixture = structuredClone(dashboardFixture)

  return {
    ...fixture,
    currentRole: toCurrentRole(currentRole, roles.profile.complete),
    metrics: { ...fixture.metrics, roleFit: toRoleFit(currentRole) },
  }
}
