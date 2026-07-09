export const scenarioValues = [
  "default",
  "loading",
  "empty",
  "error",
  "firstTime",
  "incomplete",
  "submitting",
  "submitError",
  "success",
] as const

export type Scenario = (typeof scenarioValues)[number]

export const defaultScenario: Scenario = "default"

const scenarioSearchParam = "scenario"
const pageScenarioSearchParamSuffix = "Scenario"

export function isScenario(value: string | null): value is Scenario {
  return scenarioValues.includes(value as Scenario)
}

export function parseScenario(value: string | null) {
  return isScenario(value) ? value : null
}

export function getPageScenarioSearchParam(page: string) {
  return `${page}${pageScenarioSearchParamSuffix}`
}

export function getScenarioFromSearchParams(searchParams: URLSearchParams, page?: string) {
  const pageScenario = page
    ? parseScenario(searchParams.get(getPageScenarioSearchParam(page)))
    : null

  return pageScenario ?? parseScenario(searchParams.get(scenarioSearchParam)) ?? defaultScenario
}

export function readScenario(page?: string, search = getCurrentSearch()) {
  return getScenarioFromSearchParams(new URLSearchParams(search), page)
}

function getCurrentSearch() {
  return typeof window === "undefined" ? "" : window.location.search
}
