import { dashboardFixture } from "@/mocks/fixtures/dashboard"
import type { DashboardResponse } from "@/models/dashboard"
import type { RoleResponse } from "@/api/generated/models"
import { hasJobDescription } from "@/lib/job-description"
import { isCareerProfileComplete } from "@/lib/career-profile"
import { getProfile } from "@/services/profile"
import { listRoles, getJdExtractionState } from "@/services/roles"

function toCurrentRole(
  role: RoleResponse | null,
  profileCompleted: boolean,
  jobDescriptionAdded: boolean,
): DashboardResponse["currentRole"] {
  if (role === null) return null
  return {
    id: role.id,
    title: role.title,
    company: role.company,
    recruitmentType: role.recruitmentTrack,
    location: role.location,
    profileCompleted,
    jobDescriptionAdded,
  }
}

function toRoleFit(role: RoleResponse | null): DashboardResponse["metrics"]["roleFit"] {
  return {
    currentValue: role && !role.matching.isStale ? (role.matching.result?.score ?? null) : null,
    previousValue: null,
  }
}

export async function getDashboardData(): Promise<DashboardResponse> {
  const [roles, profile] = await Promise.all([listRoles(), getProfile()])
  let currentRole = roles.activeRoleId
    ? (roles.roles.find(({ id }) => id === roles.activeRoleId) ?? null)
    : null
  const fixture = structuredClone(dashboardFixture)
  const task = currentRole ? await getJdExtractionState(currentRole.id) : null
  if (currentRole && task?.status === "idle") {
    const roleId = currentRole.id
    currentRole = (await listRoles()).roles.find((role) => role.id === roleId) ?? null
  }

  return {
    ...fixture,
    currentRole: toCurrentRole(
      currentRole,
      isCareerProfileComplete(profile),
      currentRole !== null && (task?.status !== "idle" || hasJobDescription(currentRole.jd)),
    ),
    metrics: { ...fixture.metrics, roleFit: toRoleFit(currentRole) },
  }
}
