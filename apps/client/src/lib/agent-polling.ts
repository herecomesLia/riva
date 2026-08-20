import { useCallback, useEffect, useRef, useState } from "react"

export const AGENT_POLLING_FAST_WINDOW_MS = 10_000
export const AGENT_POLLING_MEDIUM_WINDOW_MS = 30_000
export const AGENT_POLLING_TIMEOUT_MS = 5 * 60_000
export const AGENT_POLLING_FAST_INTERVAL_MS = 500
export const AGENT_POLLING_MEDIUM_INTERVAL_MS = 2_000
export const AGENT_POLLING_SLOW_INTERVAL_MS = 5_000

export function getAgentPollingInterval(elapsedMs: number): number | false {
  if (elapsedMs >= AGENT_POLLING_TIMEOUT_MS) return false
  if (elapsedMs < AGENT_POLLING_FAST_WINDOW_MS) return AGENT_POLLING_FAST_INTERVAL_MS
  if (elapsedMs < AGENT_POLLING_MEDIUM_WINDOW_MS) return AGENT_POLLING_MEDIUM_INTERVAL_MS
  return AGENT_POLLING_SLOW_INTERVAL_MS
}

type PollingDeadline = {
  operationKey: string | null
  startedAt: number
}

export function useAgentPolling(operationKey: string | null) {
  const deadlineRef = useRef<PollingDeadline>({ operationKey, startedAt: Date.now() })
  const [resetVersion, setResetVersion] = useState(0)
  const [timedOutDeadline, setTimedOutDeadline] = useState<PollingDeadline | null>(null)

  if (deadlineRef.current.operationKey !== operationKey) {
    deadlineRef.current = { operationKey, startedAt: Date.now() }
  }

  useEffect(() => {
    if (operationKey === null) return

    const deadline = deadlineRef.current
    const remainingMs = Math.max(0, AGENT_POLLING_TIMEOUT_MS - (Date.now() - deadline.startedAt))
    const timer = window.setTimeout(() => {
      setTimedOutDeadline(deadline)
    }, remainingMs)

    return () => window.clearTimeout(timer)
  }, [operationKey, resetVersion])

  const getPollingInterval = useCallback((): number | false => {
    const deadline = deadlineRef.current
    if (operationKey === null || deadline.operationKey !== operationKey) return false
    return getAgentPollingInterval(Date.now() - deadline.startedAt)
  }, [operationKey])

  const reset = useCallback(() => {
    deadlineRef.current = { operationKey, startedAt: Date.now() }
    setTimedOutDeadline(null)
    setResetVersion((version) => version + 1)
  }, [operationKey])

  const recheck = useCallback(
    <Result>(refetch: () => Result): Result => {
      reset()
      return refetch()
    },
    [reset],
  )

  const deadline = deadlineRef.current
  const isTimedOut =
    operationKey !== null &&
    timedOutDeadline?.operationKey === operationKey &&
    timedOutDeadline.startedAt === deadline.startedAt

  return { getPollingInterval, isTimedOut, recheck, reset }
}
