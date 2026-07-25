import type { TrainingRecordRecommendation } from "./training-records"

export type DashboardMetricSnapshot = {
  currentValue: number | null
  previousValue: number | null
}

export type DashboardPerformanceRecord = {
  id: string
  occurredAt: string
  /** Business score on the same 0–100 scale as training history. */
  score: number
}

export type DashboardRecruitmentType = "campus" | "experienced"

export type DashboardWeaknessCategory =
  "projectExpression" | "quantifiedResults" | "pressureResponse"

export type DashboardResponse = {
  currentRole: {
    id: string
    title: string
    company: string | null
    recruitmentType: DashboardRecruitmentType | null
    location: string | null
    experienceYears: {
      min: number | null
      max: number | null
    } | null
    profileCompleted: boolean
    jobDescriptionAdded: boolean
  } | null
  recommendation: {
    id: string
    sourceRecordId: string
    targetRoleId: string
    recommendation: TrainingRecordRecommendation
    estimatedMinutes: number
  } | null
  metrics: {
    roleFit: DashboardMetricSnapshot
    practiceTimeMinutes: DashboardMetricSnapshot
    /** Latest and previous scored targeted-practice records, on a 0–100 scale. */
    targetedPracticeScore: DashboardMetricSnapshot
    /** Latest and previous scored mock-interview records, on a 0–100 scale. */
    mockInterviewScore: DashboardMetricSnapshot
  }
  performanceTrend: {
    targetedPractice: DashboardPerformanceRecord[]
    mockInterview: DashboardPerformanceRecord[]
  }
  weaknesses: Array<{
    id: string
    category: DashboardWeaknessCategory
    description: string
    recommendedPracticeCount: number
  }>
}
