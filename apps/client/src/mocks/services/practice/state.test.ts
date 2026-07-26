import { afterEach, describe, expect, it, vi } from "vitest"

import {
  consumePracticeMockOperation,
  resetPracticeMockState,
} from "@/mocks/services/practice/state"

describe("practice mock failure controller", () => {
  afterEach(() => {
    vi.useRealTimers()
    resetPracticeMockState()
  })

  it("consumes a configured failure only once", async () => {
    resetPracticeMockState("setupReady", {
      defaultDelayMs: 0,
      failNext: ["startPracticeSession"],
    })

    await expect(consumePracticeMockOperation("startPracticeSession")).rejects.toThrow(
      "Practice mock operation failed: startPracticeSession",
    )
    await expect(consumePracticeMockOperation("startPracticeSession")).resolves.toBe("success")
  })

  it("consumes unavailable guidance only once", async () => {
    resetPracticeMockState("answeringQuestion", {
      defaultDelayMs: 0,
      unavailableNext: ["requestPracticeReferenceAnswer"],
    })

    await expect(consumePracticeMockOperation("requestPracticeReferenceAnswer")).resolves.toBe(
      "unavailable",
    )
    await expect(consumePracticeMockOperation("requestPracticeReferenceAnswer")).resolves.toBe(
      "success",
    )
  })

  it("reset clears pending failures, unavailable responses, and delays", async () => {
    resetPracticeMockState("answeringQuestion", {
      defaultDelayMs: 0,
      delayNext: { getPracticePage: 60_000 },
      failNext: ["submitPrimaryAnswer"],
      unavailableNext: ["requestPracticeHint"],
    })
    resetPracticeMockState("answeringQuestion", { defaultDelayMs: 0 })

    await expect(consumePracticeMockOperation("submitPrimaryAnswer")).resolves.toBe("success")
    await expect(consumePracticeMockOperation("requestPracticeHint")).resolves.toBe("success")
    await expect(consumePracticeMockOperation("getPracticePage")).resolves.toBe("success")
  })

  it("uses fake timers for a one-shot controlled delay", async () => {
    vi.useFakeTimers()
    resetPracticeMockState("setupReady", {
      defaultDelayMs: 0,
      delayNext: { getPracticePage: 60_000 },
    })
    let settled = false
    const request = consumePracticeMockOperation("getPracticePage").then((outcome) => {
      settled = true
      return outcome
    })

    await vi.advanceTimersByTimeAsync(59_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(request).resolves.toBe("success")

    await expect(consumePracticeMockOperation("getPracticePage")).resolves.toBe("success")
  })
})
