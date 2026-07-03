export type DashboardHero = {
  eyebrow: string
  title: string
  description: string
}

export type ProgressMetric = {
  key: string
  label: string
  value: string
  detail: string
}

export type RoleReadinessItem = {
  label: string
  value: string
}

export type CurrentRole = {
  id: string
  title: string
  company: string
  status: string
  summary: string
  keywords: string[]
  readiness: RoleReadinessItem[]
}

export type Recommendation = {
  id: string
  title: string
  reason: string
  actionLabel: string
  actionType: string
  targetId?: string
}

export type RecentPractice = {
  id: string
  title: string
  displayTime: string
  score: number
  mode: string
}

export type DashboardSummary = {
  hero: DashboardHero
  progress: ProgressMetric[]
  currentRole: CurrentRole | null
  recommendations: Recommendation[]
  recentPractice: RecentPractice[]
}
