import { useEffect, useRef, useState } from "react"
import type { PracticeData } from "@/models/practice-workflow"
import { getPracticeEvaluationStatus } from "@/services/practice"
import { usePracticeMutation } from "./usePracticeSession"

export function usePracticeEvaluationPolling(data: PracticeData | undefined) {
  const active = data?.session.status === "evaluating"
  const requested = useRef(false)
  const retryLock = useRef(false)
  const [failed, setFailed] = useState(false)
  const { mutate, reset, isError, isPending } = usePracticeMutation(getPracticeEvaluationStatus)
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
    evaluationError: failed || isError,
    isEvaluationRetrying: isPending,
    retryEvaluation: () => {
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
