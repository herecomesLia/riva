import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dashboardResponse } from "@/mocks/data/dashboard"
import type { DashboardResponse } from "@/models/dashboard"
import { getDashboardData } from "@/services/dashboard"

vi.mock("@/app/env", () => ({
  env: { mock: true },
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

async function resolveMockDashboardData(): Promise<DashboardResponse> {
  const responsePromise = getDashboardData()

  await vi.advanceTimersByTimeAsync(1000)

  return responsePromise
}

describe("getDashboardData", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps the mock request pending until the delay completes, then returns DashboardResponse", async () => {
    let settled = false
    const responsePromise = getDashboardData().then((response) => {
      settled = true
      return response
    })

    await vi.advanceTimersByTimeAsync(999)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)

    await expect(responsePromise).resolves.toEqual(dashboardResponse)
  })

  it("returns an independent response copy for each mock request", async () => {
    const firstResponse = await resolveMockDashboardData()

    firstResponse.currentRole!.title = "Mutated role title"
    firstResponse.weaknesses[0].description = "Mutated weakness description"

    const secondResponse = await resolveMockDashboardData()

    expect(secondResponse).toEqual(dashboardResponse)
  })

  it("returns JSON-serializable business data without translation keys or presentation fields", async () => {
    const response = await resolveMockDashboardData()
    const serializedResponse = JSON.stringify(response)
    const keys: string[] = []
    const strings: string[] = []

    collectKeysAndStrings(response, keys, strings)

    expect(serializedResponse).toBe(JSON.stringify(dashboardResponse))
    expect(strings.some((value) => value.includes("dashboard."))).toBe(false)
    expect(keys.some((key) => presentationFields.has(key))).toBe(false)
  })
})
