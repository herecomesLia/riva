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
  const hintMutation = usePracticeMutation("followUpHintReveal", requestPracticeFollowUpHint)
  const frameworkMutation = usePracticeMutation(
    "followUpFrameworkReveal",
    requestPracticeFollowUpFramework,
  )
  const referenceAnswerMutation = usePracticeMutation(
    "followUpReferenceAnswerRequest",
    requestPracticeFollowUpReferenceAnswer,
  )
  const submitMutation = usePracticeMutation("submitFollowUpAnswer", submitFollowUpAnswer)
  const endMutation = usePracticeMutation("endFollowUps", endPracticeFollowUps)
  const interactionLocked =
    hintMutation.isPending ||
    frameworkMutation.isPending ||
    referenceAnswerMutation.isPending ||
    submitMutation.isPending ||
    endMutation.isPending

  return {
    actions: {
      onRequestFramework: (input) => runAction(() => frameworkMutation.mutateAsync(input)),
      onRequestHint: (input) => runAction(() => hintMutation.mutateAsync(input)),
      onRequestReferenceAnswer: (input) =>
        runAction(() => referenceAnswerMutation.mutateAsync(input)),
      onEndFollowUps: (input) => runAction(() => endMutation.mutateAsync(input)),
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
