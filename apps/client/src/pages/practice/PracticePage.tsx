import { useSearch } from "@tanstack/react-router"

import { parsePracticeEntrySearch } from "@/app/training-entry-search"
import { applyPracticeEntrySearch } from "@/app/training-entry-defaults"

import {
  usePracticeAnsweringActions,
  usePracticeActionLock,
} from "./hooks/usePracticeAnsweringActions"
import { usePracticeEvaluationPolling } from "./hooks/usePracticeEvaluationPolling"
import { usePracticeFollowUpActions } from "./hooks/usePracticeFollowUpActions"
import { usePracticeGenerationPolling } from "./hooks/usePracticeGenerationPolling"
import { usePracticeReviewActions } from "./hooks/usePracticeReviewActions"
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
    historyEntryStatus,
    retryHistoryEntry,
  } = usePracticeSession(entrySearch)
  const generation = usePracticeGenerationPolling(practiceQuery.data)
  const evaluation = usePracticeEvaluationPolling(practiceQuery.data)
  const runAction = usePracticeActionLock()
  const answering = usePracticeAnsweringActions(runAction)
  const followUp = usePracticeFollowUpActions(runAction)
  const review = usePracticeReviewActions(runAction)

  if (historyEntryStatus === "pending") {
    return <PracticeView content={{ status: "loading" }} variant="default" />
  }

  if (historyEntryStatus === "error") {
    return <PracticeView isRetrying={false} onRetry={retryHistoryEntry} variant="error" />
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
          data: applyPracticeEntrySearch(practiceQuery.data, entrySearch),
        }}
        evaluationError={evaluation.evaluationError}
        followUpActions={followUp.actions}
        followUpPending={followUp.pending}
        generationError={generation.generationError}
        isEvaluationRetrying={evaluation.isEvaluationRetrying}
        isGenerationRetrying={generation.isGenerationRetrying}
        isStarting={isStarting}
        onRetryEvaluation={evaluation.retryEvaluation}
        onRetryGeneration={generation.retryGeneration}
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
