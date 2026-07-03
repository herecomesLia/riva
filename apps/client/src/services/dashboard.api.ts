import { request } from './http'
import type {
  CurrentRole,
  DashboardSummary,
  RecentPractice,
  Recommendation,
} from '../types/dashboard'

export function getDashboardSummary() {
  return request<DashboardSummary>('/api/dashboard/summary')
}

export function getRecentPractice() {
  return request<{ items: RecentPractice[] }>('/api/dashboard/recent-practice')
}

export function getRecommendations() {
  return request<{ items: Recommendation[] }>('/api/dashboard/recommendations')
}

export function getCurrentRole() {
  return request<{ role: CurrentRole | null }>('/api/dashboard/current-role')
}
