import { mockDashboardSummary, mockEmptyDashboardSummary } from '../data/dashboard.mock'
import type { DashboardSummary } from '../../types/dashboard'
import { readPageScenario } from './url'
import type { PageStateResult } from './types'

export function getDashboardPageState(): PageStateResult<DashboardSummary> {
  const scenario = readPageScenario({ page: 'dashboard' })

  if (scenario === 'error') {
    return {
      scenario,
      errorMessage: 'Dashboard 数据暂时不可用',
    }
  }

  if (scenario === 'empty' || scenario === 'firstTime') {
    return {
      scenario,
      data: mockEmptyDashboardSummary,
    }
  }

  return {
    scenario,
    data: mockDashboardSummary,
  }
}
