export type DashboardMetricSnapshot = {
  currentValue: number | null
  previousValue: number | null
}

export type DashboardPerformanceRecord = {
  id: string
  occurredAt: string
  score: number
}

export type DashboardResponse = {
  currentRole: {
    id: string
    title: string
    company: string | null
    recruitmentType: "campus" | "experienced" | null
    location: string | null
    experienceYears: {
      min: number
      max: number
    } | null
    profileCompleted: boolean
    jobDescriptionAdded: boolean
  } | null
  recommendation: {
    id: string
    title: string
    description: string
    questionType: string
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
    category: string
    description: string
    recommendedPracticeCount: number
  }>
}
