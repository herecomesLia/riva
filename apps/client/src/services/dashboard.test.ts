import { afterEach, describe, expect, it, vi } from "vitest"

import { getDashboardData } from "@/services/dashboard"

vi.mock("@/app/env", () => ({
  env: { mock: true },
}))

describe("getDashboardData", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns an independent copy of the mock response", async () => {
    vi.useFakeTimers()

    const firstResponsePromise = getDashboardData()
    await vi.advanceTimersByTimeAsync(1000)
    const firstResponse = await firstResponsePromise

    firstResponse.currentRole!.title = "Changed title"

    const secondResponsePromise = getDashboardData()
    await vi.advanceTimersByTimeAsync(1000)
    const secondResponse = await secondResponsePromise

    expect(secondResponse.currentRole!.title).toBe("Frontend Engineer")
  })
})
