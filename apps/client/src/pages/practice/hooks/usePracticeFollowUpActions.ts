import { endPracticeFollowUps, submitFollowUpAnswer } from "@/services/practice"

import type { PracticeFollowUpActions, PracticeFollowUpPending } from "../PracticeView"
import type { RunPracticeAction } from "./usePracticeAnsweringActions"
import { usePracticeMutation } from "./usePracticeSession"

export function usePracticeFollowUpActions(runAction: RunPracticeAction): {
  actions: PracticeFollowUpActions
  pending: PracticeFollowUpPending
} {
  const submitMutation = usePracticeMutation(submitFollowUpAnswer)
  const endMutation = usePracticeMutation(endPracticeFollowUps)
  const interactionLocked = submitMutation.isPending || endMutation.isPending

  return {
    actions: {
      onEndFollowUps: () => runAction(() => endMutation.mutateAsync()),
      onSubmitFollowUp: (input) => runAction(() => submitMutation.mutateAsync(input)),
    },
    pending: {
      end: endMutation.isPending,
      interactionLocked,
      submit: submitMutation.isPending,
    },
  }
}
