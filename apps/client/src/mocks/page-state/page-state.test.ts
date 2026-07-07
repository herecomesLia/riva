import { afterEach, describe, expect, it } from 'vitest'
import { getDashboardPageState, getResumeProfilePageState, readPageScenario } from './index'

function setSearch(search: string) {
  window.history.replaceState(null, '', search ? `/${search}` : '/')
}

afterEach(() => {
  setSearch('')
})

describe('page-state scenario reader', () => {
  it('uses the page-specific scenario before the generic scenario', () => {
    setSearch('?scenario=error&dashboardScenario=empty')

    expect(readPageScenario({ page: 'dashboard' })).toBe('empty')
  })

  it('falls back to the generic scenario', () => {
    setSearch('?scenario=error')

    expect(readPageScenario({ page: 'dashboard' })).toBe('error')
  })

  it('supports resumeScenario as an alias for resume pages', () => {
    setSearch('?resumeScenario=empty')

    expect(getResumeProfilePageState()).toMatchObject({
      scenario: 'empty',
      data: { profile: null },
    })
  })

  it('returns dashboard empty and error page states', () => {
    setSearch('?dashboardScenario=empty')
    expect(getDashboardPageState().data?.progress).toHaveLength(0)

    setSearch('?dashboardScenario=error')
    expect(getDashboardPageState()).toMatchObject({
      scenario: 'error',
      errorMessage: 'Dashboard 数据暂时不可用',
    })
  })
})
