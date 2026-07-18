import { dashboardResponseMock } from "@/mocks/data/dashboard"
import { getRolesPage } from "@/mocks/services/roles"
import type { DashboardResponse } from "@/models/dashboard"
import type { TargetRole, TargetRoleExperienceRange } from "@/models/roles"

function copy<T>(value: T): T {
  return structuredClone(value)
}

function toDashboardExperienceYears(
  experienceRange: TargetRoleExperienceRange | null,
): NonNullable<DashboardResponse["currentRole"]>["experienceYears"] {
  if (!experienceRange || experienceRange.minYears === null || experienceRange.maxYears === null) {
    return null
  }
  return { min: experienceRange.minYears, max: experienceRange.maxYears }
}

function toCurrentRoleSummary(
  role: TargetRole | null,
  profileCompleted: boolean,
): DashboardResponse["currentRole"] {
  if (!role) return null
  return {
    id: role.id,
    title: role.title,
    company: role.company,
    recruitmentType: role.recruitmentType,
    location: role.location,
    experienceYears: toDashboardExperienceYears(role.experienceRange),
    profileCompleted,
    jobDescriptionAdded: role.jobDescription.status !== "missing",
  }
}

export async function getDashboardData(): Promise<DashboardResponse> {
  const rolesResponse = await getRolesPage()
  const currentRole = rolesResponse.currentRoleId
    ? (rolesResponse.roles.find((role) => role.id === rolesResponse.currentRoleId) ?? null)
    : null
  const profileCompleted =
    rolesResponse.profileContext.exists && rolesResponse.profileContext.completed

  return {
    ...copy(dashboardResponseMock),
    currentRole: toCurrentRoleSummary(currentRole, profileCompleted),
  }
}
