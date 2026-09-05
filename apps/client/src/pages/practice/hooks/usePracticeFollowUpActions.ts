import {
  endPracticeFollowUps,
  requestPracticeFollowUpFramework,
  requestPracticeFollowUpHint,
  requestPracticeFollowUpReferenceAnswer,
  submitFollowUpAnswer,
} from "@/services/practice"

import type { PracticeFollowUpActions, PracticeFollowUpPending } from "../PracticeView"
import type { RunPracticeAction } from "./usePracticeAnsweringActions"
import { usePracticeMutation } from "./usePracticeSession"

export function usePracticeFollowUpActions(runAction: RunPracticeAction): {
  actions: PracticeFollowUpActions
  pending: PracticeFollowUpPending
} {
  const hintMutation = usePracticeMutation(requestPracticeFollowUpHint)
  const frameworkMutation = usePracticeMutation(requestPracticeFollowUpFramework)
  const referenceAnswerMutation = usePracticeMutation(requestPracticeFollowUpReferenceAnswer)
  const submitMutation = usePracticeMutation(submitFollowUpAnswer)
  const endMutation = usePracticeMutation(endPracticeFollowUps)
  const interactionLocked =
    hintMutation.isPending ||
    frameworkMutation.isPending ||
    referenceAnswerMutation.isPending ||
    submitMutation.isPending ||
    endMutation.isPending

  return {
    actions: {
      onRequestFramework: () => runAction(() => frameworkMutation.mutateAsync()),
      onRequestHint: () => runAction(() => hintMutation.mutateAsync()),
      onRequestReferenceAnswer: () => runAction(() => referenceAnswerMutation.mutateAsync()),
      onEndFollowUps: () => runAction(() => endMutation.mutateAsync()),
      onSubmitFollowUp: (input) => runAction(() => submitMutation.mutateAsync(input)),
    },
    pending: {
      end: endMutation.isPending,
      framework: frameworkMutation.isPending,
      hint: hintMutation.isPending,
      interactionLocked,
      referenceAnswer: referenceAnswerMutation.isPending,
      submit: submitMutation.isPending,
    },
  }
}
