import { useQuery } from "@tanstack/react-query"

import { dashboardQueryKeys } from "@/app/dashboard-query"
import { useAuth } from "@/hooks/use-auth"
import { getDashboardData } from "@/services/dashboard"

import { DashboardView } from "./DashboardView"
import { useTrainingPlanningRecommendation } from "./hooks/useTrainingPlanningRecommendation"

export function DashboardPage() {
  const { currentUser } = useAuth()
  const dashboardQuery = useQuery({
    queryFn: getDashboardData,
    queryKey: dashboardQueryKeys.all,
    retry: false,
  })
  const trainingPlanning = useTrainingPlanningRecommendation(dashboardQuery.data?.currentRole)
  const currentRole = dashboardQuery.data?.currentRole
  const useTrainingPlanning = Boolean(
    currentRole?.profileCompleted && currentRole.jobDescriptionAdded,
  )

  if (dashboardQuery.data !== undefined) {
    return (
      <DashboardView
        content={{ status: "ready", data: dashboardQuery.data }}
        displayName={currentUser?.displayName ?? ""}
        trainingPlanning={
          currentRole === null || useTrainingPlanning ? trainingPlanning : undefined
        }
        variant="default"
      />
    )
  }

  if (dashboardQuery.isFetching) {
    return (
      <DashboardView
        content={{ status: "loading" }}
        displayName={currentUser?.displayName ?? ""}
        variant="default"
      />
    )
  }

  if (dashboardQuery.isError) {
    return <DashboardView onRetry={() => void dashboardQuery.refetch()} variant="error" />
  }

  return (
    <DashboardView
      content={{ status: "loading" }}
      displayName={currentUser?.displayName ?? ""}
      variant="default"
    />
  )
}
