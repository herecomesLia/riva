import { useSearch } from "@tanstack/react-router"

import { parsePracticeEntrySearch } from "@/app/training-entry-search"

import {
  usePracticeAnsweringActions,
  usePracticeActionLock,
} from "./hooks/usePracticeAnsweringActions"
import { usePracticeFollowUpActions } from "./hooks/usePracticeFollowUpActions"
import { usePracticeStageRequest } from "./hooks/usePracticeStageRequest"
import { getQuestionGenerationStatus, getPracticeEvaluationStatus } from "@/services/practice"
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
    historyEntryResolution,
    retryHistoryEntry,
  } = usePracticeSession(entrySearch)
  const generation = usePracticeStageRequest(
    practiceQuery.data?.session.status === "generatingQuestion",
    getQuestionGenerationStatus,
  )
  const evaluation = usePracticeStageRequest(
    practiceQuery.data?.session.status === "evaluating",
    getPracticeEvaluationStatus,
  )
  const runAction = usePracticeActionLock()
  const answering = usePracticeAnsweringActions(runAction)
  const followUp = usePracticeFollowUpActions(runAction)
  const review = usePracticeReviewActions(runAction)

  if (historyEntryStatus === "pending") {
    return <PracticeView content={{ status: "loading" }} variant="default" />
  }

  if (historyEntryStatus === "error") {
    return (
      <PracticeView isRetrying={false} onRetry={retryHistoryEntry} variant="historyEntryError" />
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
        evaluationError={evaluation.error}
        followUpActions={followUp.actions}
        followUpPending={followUp.pending}
        generationError={generation.error}
        isEvaluationRetrying={evaluation.isRetrying}
        isGenerationRetrying={generation.isRetrying}
        isStarting={isStarting}
        historyEntryResolution={historyEntryResolution}
        onRetryEvaluation={evaluation.retry}
        onRetryGeneration={generation.retry}
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
