import { useSearch } from "@tanstack/react-router"

import { parsePracticeEntrySearch } from "@/app/training-entry-search"

import {
  usePracticeAnsweringActions,
  usePracticeActionLock,
} from "./hooks/usePracticeAnsweringActions"
import { usePracticeFollowUpActions } from "./hooks/usePracticeFollowUpActions"
import { usePracticeTask } from "./hooks/usePracticeTask"
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
  const task = usePracticeTask(
    practiceQuery.data?.session.status === "generatingQuestion" ||
      practiceQuery.data?.session.status === "processing",
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
        followUpActions={followUp.actions}
        followUpPending={followUp.pending}
        taskError={task.error}
        isTaskRetrying={task.isRetrying}
        isStarting={isStarting}
        historyEntryResolution={historyEntryResolution}
        onRetryTask={task.retry}
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
