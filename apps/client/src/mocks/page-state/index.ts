import { env } from "@/app/env"
import {
  defaultScenario,
  getScenarioFromSearchParams,
  readScenario,
  scenarioValues,
  type Scenario,
} from "@/lib/scenario"

export type PageStateScenario = Scenario

export type PageStateMock<TDetails = never> = {
  details?: TDetails
  state: PageStateScenario
}

export type PageStateMockMap<TMock> = Partial<Record<PageStateScenario, TMock>> & {
  default: TMock
}

export const pageStateMockEnabled = env.mock
export const pageStateScenarios = scenarioValues
export { defaultScenario, getScenarioFromSearchParams, readScenario }

export function getPageStateScenario(page?: string) {
  return pageStateMockEnabled ? readScenario(page) : defaultScenario
}

export function getPageStateMock<TMock>(
  mocks: PageStateMockMap<TMock>,
  scenario: PageStateScenario = defaultScenario,
) {
  if (!pageStateMockEnabled) {
    return null
  }

  return mocks[scenario] ?? mocks.default
}
