import { dashboardFixture } from "@/mocks/fixtures/dashboard"
import type { DashboardResponse } from "@/models/dashboard"
import type { TargetRoleResponse } from "@/api/generated/models"
import type { MatchingAnalysisState } from "@/mocks/models/role"
import { hasJobDescription } from "@/lib/job-description"
import { isCareerProfileComplete } from "@/lib/career-profile"
import { getProfile } from "@/services/profile"
import { getRoles, getMatchingAnalysis, getJdExtractionState } from "@/services/roles"

function toCurrentRole(
  role: TargetRoleResponse | null,
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

function toRoleFit(
  analysis: MatchingAnalysisState | null,
): DashboardResponse["metrics"]["roleFit"] {
  return {
    currentValue: analysis?.status === "current" ? analysis.result.overallMatchScore : null,
    previousValue: null,
  }
}

export async function getDashboardData(): Promise<DashboardResponse> {
  const [roles, profile] = await Promise.all([getRoles(), getProfile()])
  let currentRole = roles.activeTargetRoleId
    ? (roles.targetRoles.find(({ id }) => id === roles.activeTargetRoleId) ?? null)
    : null
  const fixture = structuredClone(dashboardFixture)
  const [analysis, task] = currentRole
    ? await Promise.all([getMatchingAnalysis(currentRole.id), getJdExtractionState(currentRole.id)])
    : [null, null]
  if (currentRole && task?.status === "idle") {
    const roleId = currentRole.id
    currentRole = (await getRoles()).targetRoles.find((role) => role.id === roleId) ?? null
  }

  return {
    ...fixture,
    currentRole: toCurrentRole(
      currentRole,
      isCareerProfileComplete(profile),
      currentRole !== null && (task?.status !== "idle" || hasJobDescription(currentRole.jd)),
    ),
    metrics: { ...fixture.metrics, roleFit: toRoleFit(analysis) },
  }
}
