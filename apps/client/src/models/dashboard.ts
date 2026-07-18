export type DashboardMetricSnapshot = {
  currentValue: number | null
  previousValue: number | null
}

export type DashboardPerformanceRecord = {
  id: string
  occurredAt: string
  score: number
}

export type DashboardQuestionType = "projectExperience"

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
    title: string
    description: string
    questionType: DashboardQuestionType
    estimatedMinutes: number
  } | null
  metrics: {
    roleFit: DashboardMetricSnapshot
    practiceTimeMinutes: DashboardMetricSnapshot
    targetedPracticeScore: DashboardMetricSnapshot
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
