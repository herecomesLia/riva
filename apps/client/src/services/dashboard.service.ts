import { mockDashboardSummary } from '../mocks/data/dashboard.mock'
import { getDashboardPageState } from '../mocks/page-state'
import { MockStateError, waitForMockState } from '../mocks/runtime'
import type { CurrentRole, DashboardSummary, RecentPractice, Recommendation } from '../types/dashboard'

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await waitForMockState()

  const pageState = getDashboardPageState()

  if (pageState.errorMessage) {
    throw new MockStateError(pageState.errorMessage)
  }

  return pageState.data ?? mockDashboardSummary
}

export async function getRecentPractice(): Promise<{ items: RecentPractice[] }> {
  await waitForMockState()

  return { items: mockDashboardSummary.recentPractice }
}

export async function getRecommendations(): Promise<{ items: Recommendation[] }> {
  await waitForMockState()

  return { items: mockDashboardSummary.recommendations }
}

export async function getCurrentRole(): Promise<{ role: CurrentRole | null }> {
  await waitForMockState()

  return { role: mockDashboardSummary.currentRole }
}
