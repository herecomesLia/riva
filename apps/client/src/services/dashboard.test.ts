import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dashboardResponseMock } from "@/mocks/data/dashboard"
import { getDashboardData } from "@/services/dashboard"

const { envState } = vi.hoisted(() => ({
  envState: { mock: true },
}))

vi.mock("@/app/env", () => ({
  env: envState,
}))

describe("getDashboardData", () => {
  beforeEach(() => {
    envState.mock = true
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the standard mock response after the mock delay", async () => {
    const responsePromise = getDashboardData()

    await vi.advanceTimersByTimeAsync(999)
    const pendingCheck = await Promise.race([
      responsePromise.then(() => "resolved"),
      Promise.resolve("pending"),
    ])
    expect(pendingCheck).toBe("pending")

    await vi.advanceTimersByTimeAsync(1)

    await expect(responsePromise).resolves.toEqual(dashboardResponseMock)
  })

  it("returns an independent response copy for each mock request", async () => {
    const firstResponsePromise = getDashboardData()
    await vi.advanceTimersByTimeAsync(1000)
    const firstResponse = await firstResponsePromise

    firstResponse.currentRole!.title = "Mutated role title"
    firstResponse.weaknesses[0].description = "Mutated weakness description"

    const secondResponsePromise = getDashboardData()
    await vi.advanceTimersByTimeAsync(1000)
    const secondResponse = await secondResponsePromise

    expect(secondResponse).toEqual(dashboardResponseMock)
    expect(secondResponse).not.toBe(firstResponse)
  })

  it("uses the real implementation when mock mode is disabled", async () => {
    envState.mock = false

    await expect(getDashboardData()).rejects.toThrow("Real dashboard data is not implemented.")
  })
})
