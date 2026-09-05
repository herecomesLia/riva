import { useEffect, useRef, useState } from "react"
import type { PracticeData } from "@/models/practice-workflow"
import { getQuestionGenerationStatus } from "@/services/practice"
import { usePracticeMutation } from "./usePracticeSession"

export function usePracticeGenerationPolling(data: PracticeData | undefined) {
  const active = data?.session.status === "generatingQuestion"
  const requested = useRef(false)
  const retryLock = useRef(false)
  const [failed, setFailed] = useState(false)
  const { mutate, reset, isError, isPending } = usePracticeMutation(getQuestionGenerationStatus)
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
    generationError: failed || isError,
    isGenerationRetrying: isPending,
    retryGeneration: () => {
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
