import { useRef } from "react"

import { skipPracticeQuestion, submitPrimaryAnswer } from "@/services/practice"

import type { PracticeInteractionResult } from "../practice-interaction"
import type { PracticeAnsweringActions, PracticeAnsweringPending } from "../PracticeView"
import { usePracticeMutation } from "./usePracticeSession"

export type RunPracticeAction = (
  operation: () => Promise<unknown>,
) => Promise<PracticeInteractionResult>

export function usePracticeActionLock(): RunPracticeAction {
  const lock = useRef(false)

  return async (operation) => {
    if (lock.current) return "ignored"
    lock.current = true
    try {
      await operation()
      return "executed"
    } finally {
      lock.current = false
    }
  }
}

export function usePracticeAnsweringActions(runAction: RunPracticeAction): {
  actions: PracticeAnsweringActions
  pending: PracticeAnsweringPending
} {
  const submitAnswerMutation = usePracticeMutation(submitPrimaryAnswer)
  const skipMutation = usePracticeMutation(skipPracticeQuestion)
  const interactionLocked = submitAnswerMutation.isPending || skipMutation.isPending

  return {
    actions: {
      onSkip: () => runAction(() => skipMutation.mutateAsync()),
      onSubmitAnswer: (input) => runAction(() => submitAnswerMutation.mutateAsync(input)),
    },
    pending: {
      interactionLocked,
      skip: skipMutation.isPending,
      submitAnswer: submitAnswerMutation.isPending,
    },
  }
}
