import { describe, expect, it } from "vitest"

import {
  defaultScenario,
  getScenarioFromSearchParams,
  parseScenario,
  scenarioValues,
} from "@/lib/scenario"

describe("scenario", () => {
  it("parses valid scenarios", () => {
    for (const scenario of scenarioValues) {
      expect(parseScenario(scenario)).toBe(scenario)
    }
  })

  it("returns null for invalid scenarios", () => {
    expect(parseScenario("unknown")).toBeNull()
    expect(parseScenario("")).toBeNull()
    expect(parseScenario(null)).toBeNull()
  })

  it("prefers page scenario over global scenario", () => {
    const searchParams = new URLSearchParams({
      dashboardScenario: "error",
      scenario: "empty",
    })

    expect(getScenarioFromSearchParams(searchParams, "dashboard")).toBe("error")
  })

  it("returns default when no scenario is provided", () => {
    expect(getScenarioFromSearchParams(new URLSearchParams())).toBe(defaultScenario)
  })
})
