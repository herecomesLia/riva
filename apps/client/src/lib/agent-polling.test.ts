import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AGENT_POLLING_TIMEOUT_MS, getAgentPollingInterval, useAgentPolling } from "./agent-polling"

describe("getAgentPollingInterval", () => {
  it("uses the shared 500ms, 2s, and 5s schedule before stopping at five minutes", () => {
    expect(getAgentPollingInterval(0)).toBe(500)
    expect(getAgentPollingInterval(9_999)).toBe(500)
    expect(getAgentPollingInterval(10_000)).toBe(2_000)
    expect(getAgentPollingInterval(29_999)).toBe(2_000)
    expect(getAgentPollingInterval(30_000)).toBe(5_000)
    expect(getAgentPollingInterval(AGENT_POLLING_TIMEOUT_MS - 1)).toBe(5_000)
    expect(getAgentPollingInterval(AGENT_POLLING_TIMEOUT_MS)).toBe(false)
  })
})

describe("useAgentPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("times out, resets when the operation changes, and supports manual recheck", () => {
    const { result, rerender } = renderHook(({ operationKey }) => useAgentPolling(operationKey), {
      initialProps: { operationKey: "run-1" as string | null },
    })

    act(() => vi.advanceTimersByTime(AGENT_POLLING_TIMEOUT_MS))
    expect(result.current.isTimedOut).toBe(true)
    expect(result.current.getPollingInterval()).toBe(false)

    rerender({ operationKey: "run-2" })
    expect(result.current.isTimedOut).toBe(false)
    expect(result.current.getPollingInterval()).toBe(500)

    act(() => vi.advanceTimersByTime(AGENT_POLLING_TIMEOUT_MS))
    expect(result.current.isTimedOut).toBe(true)

    const refetch = vi.fn()
    act(() => result.current.recheck(refetch))
    expect(refetch).toHaveBeenCalledOnce()
    expect(result.current.isTimedOut).toBe(false)
    expect(result.current.getPollingInterval()).toBe(500)
  })

  it("cleans up its deadline timer on unmount", () => {
    const { unmount } = renderHook(() => useAgentPolling("run-1"))
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
