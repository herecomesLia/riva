import { useSearch } from "@tanstack/react-router"

import { parsePracticeEntrySearch } from "@/app/training-entry-search"

import {
  usePracticeAnsweringActions,
  usePracticeActionLock,
} from "./hooks/usePracticeAnsweringActions"
import { usePracticeEvaluationPolling } from "./hooks/usePracticeEvaluationPolling"
import { usePracticeFollowUpActions } from "./hooks/usePracticeFollowUpActions"
import { usePracticeFollowUpGenerationPolling } from "./hooks/usePracticeFollowUpGenerationPolling"
import { usePracticeGenerationPolling } from "./hooks/usePracticeGenerationPolling"
import { usePracticeReviewActions } from "./hooks/usePracticeReviewActions"
import { usePracticeReferenceAnswerPolling } from "./hooks/usePracticeReferenceAnswerPolling"
import { usePracticeSession } from "./hooks/usePracticeSession"
import { PracticeView } from "./PracticeView"

export function PracticePage() {
  const entrySearch = parsePracticeEntrySearch(useSearch({ strict: false }))
  const {
    practiceQuery,
    start,
    isStarting,
    prepareNextRound,
    isPreparingNextRound,
    trainingEntryStatus,
    trainingEntryResolution,
    retryTrainingEntry,
  } = usePracticeSession(entrySearch)
  const generation = usePracticeGenerationPolling(practiceQuery.data)
  const followUpGeneration = usePracticeFollowUpGenerationPolling(practiceQuery.data)
  const referenceAnswer = usePracticeReferenceAnswerPolling(practiceQuery.data)
  const evaluation = usePracticeEvaluationPolling(practiceQuery.data)
  const runAction = usePracticeActionLock()
  const answering = usePracticeAnsweringActions(runAction)
  const followUp = usePracticeFollowUpActions(runAction)
  const review = usePracticeReviewActions(runAction)

  if (trainingEntryStatus === "pending") {
    return <PracticeView content={{ status: "loading" }} variant="default" />
  }

  if (trainingEntryStatus === "error") {
    return (
      <PracticeView isRetrying={false} onRetry={retryTrainingEntry} variant="trainingEntryError" />
    )
  }

  if (practiceQuery.data !== undefined) {
    return (
      <PracticeView
        answeringActions={answering.actions}
        answeringPending={answering.pending}
        completedActions={{ onPrepareNextRound: prepareNextRound }}
        completedPending={isPreparingNextRound}
        content={{
          status: "ready",
          data: practiceQuery.data,
        }}
        evaluationError={evaluation.evaluationError}
        evaluationPollingTimedOut={evaluation.evaluationPollingTimedOut}
        followUpActions={followUp.actions}
        followUpPending={followUp.pending}
        followUpGenerationError={followUpGeneration.followUpGenerationError}
        followUpGenerationPollingTimedOut={followUpGeneration.followUpGenerationPollingTimedOut}
        isFollowUpGenerationRetrying={followUpGeneration.isFollowUpGenerationRetrying}
        generationError={generation.generationError}
        generationPollingTimedOut={generation.generationPollingTimedOut}
        isEvaluationRetrying={evaluation.isEvaluationRetrying}
        isGenerationRetrying={generation.isGenerationRetrying}
        isStarting={isStarting}
        trainingEntryResolution={trainingEntryResolution}
        onRetryEvaluation={evaluation.retryEvaluation}
        onRetryFollowUpGeneration={followUpGeneration.retryFollowUpGeneration}
        onRetryGeneration={generation.retryGeneration}
        isReferenceAnswerRetrying={referenceAnswer.isReferenceAnswerRetrying}
        onRetryReferenceAnswer={referenceAnswer.retryReferenceAnswer}
        referenceAnswerError={referenceAnswer.referenceAnswerError}
        referenceAnswerPollingTimedOut={referenceAnswer.referenceAnswerPollingTimedOut}
        onStart={start}
        reviewActions={review.actions}
        reviewPending={review.pending}
        variant="default"
      />
    )
  }

  if (practiceQuery.isFetching) {
    return <PracticeView content={{ status: "loading" }} variant="default" />
  }

  if (practiceQuery.isError) {
    return (
      <PracticeView
        isRetrying={practiceQuery.isFetching}
        onRetry={() => void practiceQuery.refetch()}
        variant="error"
      />
    )
  }

  return <PracticeView content={{ status: "loading" }} variant="default" />
}
