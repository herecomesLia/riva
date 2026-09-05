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
  const savedMutation = usePracticeMutation(setQuestionSaved)
  const weakMutation = usePracticeMutation(setQuestionWeak)
  const retryMutation = usePracticeMutation(retryCurrentPracticeQuestion)
  const nextMutation = usePracticeMutation(continueToNextPracticeQuestion)
  const endMutation = usePracticeMutation(endPracticeSession)

  return {
    actions: {
      onSetSaved: (input) => runAction(() => savedMutation.mutateAsync(input)),
      onSetWeak: (input) => runAction(() => weakMutation.mutateAsync(input)),
      onRetryCurrent: () => runAction(() => retryMutation.mutateAsync()),
      onNextQuestion: () => runAction(() => nextMutation.mutateAsync()),
      onEndSession: () => runAction(() => endMutation.mutateAsync()),
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
