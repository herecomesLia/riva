import { mockDashboardSummary, mockEmptyDashboardSummary } from '../mocks/data/dashboard.mock'
import { getMockPageState, MockStateError, waitForMockState } from '../mocks/runtime'
import type { CurrentRole, DashboardSummary, RecentPractice, Recommendation } from '../types/dashboard'

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await waitForMockState()

  const state = getMockPageState('dashboard')

  if (state === 'error') {
    throw new MockStateError('Dashboard 数据暂时不可用')
  }

  return state === 'empty' ? mockEmptyDashboardSummary : mockDashboardSummary
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
