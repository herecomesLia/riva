export const PAGE_SCENARIOS = [
  'loading',
  'empty',
  'error',
  'default',
  'firstTime',
  'incomplete',
  'submitError',
] as const

export type PageScenario = (typeof PAGE_SCENARIOS)[number]

export type PageScenarioConfig = {
  aliases?: string[]
  fallback?: PageScenario
  page: string
}

export type PageStateResult<T> = {
  data?: T
  errorMessage?: string
  scenario: PageScenario
}
