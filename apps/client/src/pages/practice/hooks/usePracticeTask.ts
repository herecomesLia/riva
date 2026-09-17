import { useEffect, useRef, useState } from "react"
import { getPracticeTaskStatus, retryPracticeTask } from "@/services/practice"
import { usePracticeMutation } from "./usePracticeSession"

export function usePracticeTask(active: boolean) {
  const requested = useRef(false)
  const retryLock = useRef(false)
  const [failed, setFailed] = useState(false)
  const { mutate, reset, isError, isPending } = usePracticeMutation((retry: boolean) =>
    retry ? retryPracticeTask() : getPracticeTaskStatus(),
  )
  useEffect(() => {
    if (!active) {
      requested.current = false
      reset()
      setFailed(false)
    } else if (!requested.current) {
      requested.current = true
      mutate(false)
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
      mutate(true, {
        onSettled: () => {
          retryLock.current = false
        },
      })
    },
  }
}
