import { useSearch } from "@tanstack/react-router"

import { parsePracticeEntrySearch } from "@/app/training-entry-search"

import {
  usePracticeAnsweringActions,
  usePracticeActionLock,
} from "./hooks/usePracticeAnsweringActions"
import { usePracticeFollowUpActions } from "./hooks/usePracticeFollowUpActions"
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
    trainingEntryStatus,
    trainingEntryResolution,
    retryTrainingEntry,
  } = usePracticeSession(entrySearch)
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
        followUpActions={followUp.actions}
        followUpPending={followUp.pending}
        isStarting={isStarting}
        trainingEntryResolution={trainingEntryResolution}
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
