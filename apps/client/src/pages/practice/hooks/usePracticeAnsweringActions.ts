import { useRef } from "react"

import {
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  submitPrimaryAnswer,
} from "@/services/practice"

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
  const savedMutation = usePracticeMutation(setQuestionSaved)
  const weakMutation = usePracticeMutation(setQuestionWeak)
  const submitAnswerMutation = usePracticeMutation(submitPrimaryAnswer)
  const skipMutation = usePracticeMutation(skipPracticeQuestion)
  const interactionLocked =
    savedMutation.isPending ||
    weakMutation.isPending ||
    submitAnswerMutation.isPending ||
    skipMutation.isPending

  return {
    actions: {
      onSetSaved: (input) => runAction(() => savedMutation.mutateAsync(input)),
      onSetWeak: (input) => runAction(() => weakMutation.mutateAsync(input)),
      onSkip: () => runAction(() => skipMutation.mutateAsync()),
      onSubmitAnswer: (input) => runAction(() => submitAnswerMutation.mutateAsync(input)),
    },
    pending: {
      interactionLocked,
      saved: savedMutation.isPending,
      skip: skipMutation.isPending,
      submitAnswer: submitAnswerMutation.isPending,
      weak: weakMutation.isPending,
    },
  }
}
