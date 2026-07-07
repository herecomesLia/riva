import { PAGE_SCENARIOS, type PageScenario, type PageScenarioConfig } from './types'

function isPageScenario(value: string | null): value is PageScenario {
  return PAGE_SCENARIOS.includes(value as PageScenario)
}

function toScenarioParamName(key: string) {
  return `${key}Scenario`
}

export function readPageScenario({ aliases = [], fallback = 'default', page }: PageScenarioConfig): PageScenario {
  const searchParams = new URLSearchParams(window.location.search)
  const keys = [page, ...aliases]

  for (const key of keys) {
    const scenario = searchParams.get(toScenarioParamName(key))

    if (isPageScenario(scenario)) {
      return scenario
    }
  }

  const scenario = searchParams.get('scenario')

  return isPageScenario(scenario) ? scenario : fallback
}
