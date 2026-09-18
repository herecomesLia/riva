import {
  continueToNextPracticeQuestion,
  endPracticeSession,
  retryCurrentPracticeQuestion,
} from "@/services/practice"

import type { PracticeReviewActions, PracticeReviewPending } from "../PracticeView"
import type { RunPracticeAction } from "./usePracticeAnsweringActions"
import { usePracticeMutation } from "./usePracticeSession"

export function usePracticeReviewActions(runAction: RunPracticeAction): {
  actions: PracticeReviewActions
  pending: PracticeReviewPending
} {
  const retryMutation = usePracticeMutation(retryCurrentPracticeQuestion)
  const nextMutation = usePracticeMutation(continueToNextPracticeQuestion)
  const endMutation = usePracticeMutation(endPracticeSession)

  return {
    actions: {
      onRetryCurrent: () => runAction(() => retryMutation.mutateAsync()),
      onNextQuestion: () => runAction(() => nextMutation.mutateAsync()),
      onEndSession: () => runAction(() => endMutation.mutateAsync()),
    },
    pending: {
      interactionLocked: retryMutation.isPending || nextMutation.isPending || endMutation.isPending,
      end: endMutation.isPending,
      next: nextMutation.isPending,
      retry: retryMutation.isPending,
    },
  }
}
