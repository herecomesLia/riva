import {
  continueToNextPracticeQuestion,
  endPracticeSession,
  retryCurrentPracticeQuestion,
  setQuestionSaved,
  setQuestionWeak,
} from "@/services/practice"

import type { PracticeReviewActions, PracticeReviewPending } from "../PracticeView"
import type { RunPracticeAction } from "./usePracticeAnsweringActions"
import { usePracticeMutation } from "./usePracticeSession"

export function usePracticeReviewActions(runAction: RunPracticeAction): {
  actions: PracticeReviewActions
  pending: PracticeReviewPending
} {
  const savedMutation = usePracticeMutation("questionFlagUpdate", setQuestionSaved)
  const weakMutation = usePracticeMutation("questionFlagUpdate", setQuestionWeak)
  const retryMutation = usePracticeMutation("retryCurrentQuestion", retryCurrentPracticeQuestion)
  const nextMutation = usePracticeMutation("continueToNextQuestion", continueToNextPracticeQuestion)
  const endMutation = usePracticeMutation("endReviewSession", endPracticeSession)

  return {
    actions: {
      onSetSaved: (input) => runAction(() => savedMutation.mutateAsync(input)),
      onSetWeak: (input) => runAction(() => weakMutation.mutateAsync(input)),
      onRetryCurrent: (input) => runAction(() => retryMutation.mutateAsync(input)),
      onNextQuestion: (input) => runAction(() => nextMutation.mutateAsync(input)),
      onEndSession: (input) => runAction(() => endMutation.mutateAsync(input)),
    },
    pending: {
      interactionLocked:
        savedMutation.isPending ||
        weakMutation.isPending ||
        retryMutation.isPending ||
        nextMutation.isPending ||
        endMutation.isPending,
      end: endMutation.isPending,
      next: nextMutation.isPending,
      retry: retryMutation.isPending,
      saved: savedMutation.isPending,
      weak: weakMutation.isPending,
    },
  }
}
