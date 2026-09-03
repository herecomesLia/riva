import { deriveDashboardTrainingData } from "@/mocks/derivations/dashboard-training"
import { listTrainingRecordSnapshots } from "@/mocks/repositories/training-records"
import { getRolesPage } from "@/mocks/services/roles"
import type { DashboardResponse } from "@/models/dashboard"
import type { TargetRole } from "@/models/roles"

function toRoleFit(role: TargetRole | null): DashboardResponse["metrics"]["roleFit"] {
  if (role?.matchingAnalysis?.status !== "current") {
    return { currentValue: null, previousValue: null }
  }
  return {
    currentValue: role.matchingAnalysis.result.overallMatchScore,
    previousValue: null,
  }
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
  const training = deriveDashboardTrainingData(listTrainingRecordSnapshots())

  return {
    currentRole: toCurrentRoleSummary(currentRole, profileCompleted),
    recommendation: training.recommendation,
    metrics: {
      roleFit: toRoleFit(currentRole),
      ...training.metrics,
    },
    performanceTrend: training.performanceTrend,
    weaknesses: training.weaknesses,
  }
}
