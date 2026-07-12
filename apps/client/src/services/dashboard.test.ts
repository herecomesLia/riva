import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  dashboardEmptyResponse,
  dashboardFullResponse,
  dashboardPartialResponse,
  type DashboardMockScenario,
} from "@/mocks/data/dashboard"
import type { DashboardResponse } from "@/models/dashboard"
import { getDashboardData } from "@/services/dashboard"

const { envState } = vi.hoisted(() => ({
  envState: {
    dashboardMockScenario: "full" as DashboardMockScenario,
    mock: true,
  },
}))

vi.mock("@/app/env", () => ({
  env: envState,
}))

const presentationFields = new Set([
  "titleKey",
  "descriptionKey",
  "comparisonKey",
  "valueKey",
  "valueFormat",
  "practiceCountKey",
  "icon",
  "className",
])

function collectKeysAndStrings(value: unknown, keys: string[], strings: string[]) {
  if (typeof value === "string") {
    strings.push(value)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectKeysAndStrings(item, keys, strings))
    return
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      keys.push(key)
      collectKeysAndStrings(item, keys, strings)
    })
  }
}

async function resolveMockDashboardData(
  scenario: DashboardMockScenario,
): Promise<DashboardResponse> {
  envState.dashboardMockScenario = scenario

  const responsePromise = getDashboardData()

  await vi.advanceTimersByTimeAsync(1000)

  return responsePromise
}

function expectBusinessResponseOnly(response: DashboardResponse) {
  const serializedResponse = JSON.stringify(response)
  const keys: string[] = []
  const strings: string[] = []

  collectKeysAndStrings(response, keys, strings)

  expect(JSON.parse(serializedResponse)).toEqual(response)
  expect(strings.some((value) => value.includes("dashboard."))).toBe(false)
  expect(keys.some((key) => presentationFields.has(key))).toBe(false)
}

describe("getDashboardData", () => {
  beforeEach(() => {
    envState.dashboardMockScenario = "full"
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps the full mock request pending until the delay completes, then returns DashboardResponse", async () => {
    let settled = false
    const responsePromise = getDashboardData().then((response) => {
      settled = true
      return response
    })

    await vi.advanceTimersByTimeAsync(999)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)

    await expect(responsePromise).resolves.toEqual(dashboardFullResponse)
  })

  it("returns an independent full response copy for each mock request", async () => {
    const firstResponse = await resolveMockDashboardData("full")

    firstResponse.currentRole!.title = "Mutated role title"
    firstResponse.weaknesses[0].description = "Mutated weakness description"

    const secondResponse = await resolveMockDashboardData("full")

    expect(secondResponse).toEqual(dashboardFullResponse)
    expect(secondResponse).not.toBe(firstResponse)
  })

  it("returns legal empty data for the empty scenario", async () => {
    const response = await resolveMockDashboardData("empty")

    expect(response).toEqual(dashboardEmptyResponse)
    expect(response.currentRole).toBeNull()
    expect(response.recommendation).toBeNull()
    expect(response.metrics.roleFit.currentValue).toBeNull()
    expect(response.performanceTrend.targetedPractice).toEqual([])
    expectBusinessResponseOnly(response)
  })

  it("returns legal partial data for the partial scenario", async () => {
    const response = await resolveMockDashboardData("partial")

    expect(response).toEqual(dashboardPartialResponse)
    expect(response.currentRole).not.toBeNull()
    expect(response.currentRole?.company).toBeNull()
    expect(response.currentRole?.location).toBeNull()
    expect(response.recommendation).toBeNull()
    expect(response.metrics.roleFit.currentValue).toBe(68)
    expect(response.metrics.targetedPracticeScore.currentValue).toBeNull()
    expect(response.performanceTrend.targetedPractice).toHaveLength(1)
    expectBusinessResponseOnly(response)
  })

  it.each(["full", "empty", "partial"] as const)(
    "returns JSON-serializable business data for %s without display fields",
    async (scenario) => {
      const response = await resolveMockDashboardData(scenario)

      expectBusinessResponseOnly(response)
    },
  )

  it("rejects the error scenario only after the mock delay completes", async () => {
    envState.dashboardMockScenario = "error"
    let settled = false
    const responsePromise = getDashboardData().finally(() => {
      settled = true
    })
    const expectation = expect(responsePromise).rejects.toThrow()

    await vi.advanceTimersByTimeAsync(999)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expectation
  })

  it("rejects once and then resolves for the errorOnce scenario", async () => {
    envState.dashboardMockScenario = "errorOnce"
    const firstPromise = getDashboardData()
    const firstExpectation = expect(firstPromise).rejects.toThrow()

    await vi.advanceTimersByTimeAsync(1000)
    await firstExpectation

    const secondPromise = getDashboardData()

    await vi.advanceTimersByTimeAsync(1000)

    const secondResponse = await secondPromise
    expect(secondResponse).toEqual(dashboardFullResponse)
    expect(secondResponse).not.toBe(dashboardFullResponse)
  })
})
