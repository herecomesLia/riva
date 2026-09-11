import { useEffect, useRef, useState } from "react"
import type { PracticeSession } from "@/models/practice-workflow"
import { usePracticeMutation } from "./usePracticeSession"

export function usePracticeStageRequest(active: boolean, request: () => Promise<PracticeSession>) {
  const requested = useRef(false)
  const retryLock = useRef(false)
  const [failed, setFailed] = useState(false)
  const { mutate, reset, isError, isPending } = usePracticeMutation(request)
  useEffect(() => {
    if (!active) {
      requested.current = false
      reset()
      setFailed(false)
    } else if (!requested.current) {
      requested.current = true
      mutate()
    }
  }, [active, mutate, reset])
  useEffect(() => {
    if (isError) setFailed(true)
  }, [isError])
  return {
    error: failed || isError,
    isRetrying: isPending,
    retry: () => {
      if (!active || isPending || retryLock.current) return
      retryLock.current = true
      mutate(undefined, {
        onSettled: () => {
          retryLock.current = false
        },
      })
    },
  }
}
