import { useRef } from "react"

import {
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
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
  const hintMutation = usePracticeMutation(requestPracticeHint)
  const frameworkMutation = usePracticeMutation(requestAnswerFramework)
  const referenceAnswerMutation = usePracticeMutation(requestPracticeReferenceAnswer)
  const savedMutation = usePracticeMutation(setQuestionSaved)
  const weakMutation = usePracticeMutation(setQuestionWeak)
  const submitAnswerMutation = usePracticeMutation(submitPrimaryAnswer)
  const skipMutation = usePracticeMutation(skipPracticeQuestion)
  const endMutation = usePracticeMutation(requestEndPracticeSession)
  const interactionLocked =
    hintMutation.isPending ||
    frameworkMutation.isPending ||
    referenceAnswerMutation.isPending ||
    savedMutation.isPending ||
    weakMutation.isPending ||
    submitAnswerMutation.isPending ||
    skipMutation.isPending ||
    endMutation.isPending

  return {
    actions: {
      onEnd: (input) => runAction(() => endMutation.mutateAsync(input)),
      onRequestFramework: (input) => runAction(() => frameworkMutation.mutateAsync(input)),
      onRequestHint: (input) => runAction(() => hintMutation.mutateAsync(input)),
      onRequestReferenceAnswer: (input) =>
        runAction(() => referenceAnswerMutation.mutateAsync(input)),
      onSetSaved: (input) => runAction(() => savedMutation.mutateAsync(input)),
      onSetWeak: (input) => runAction(() => weakMutation.mutateAsync(input)),
      onSkip: (input) => runAction(() => skipMutation.mutateAsync(input)),
      onSubmitAnswer: (input) => runAction(() => submitAnswerMutation.mutateAsync(input)),
    },
    pending: {
      end: endMutation.isPending,
      framework: frameworkMutation.isPending,
      hint: hintMutation.isPending,
      referenceAnswer: referenceAnswerMutation.isPending,
      interactionLocked,
      saved: savedMutation.isPending,
      skip: skipMutation.isPending,
      submitAnswer: submitAnswerMutation.isPending,
      weak: weakMutation.isPending,
    },
  }
}
