import { useSearch } from "@tanstack/react-router"
import { parsePracticeEntrySearch } from "@/app/training-entry-search"
import { usePracticeActions } from "./hooks/usePracticeActions"
import { usePracticeSession } from "./hooks/usePracticeSession"
import { PracticeView } from "./PracticeView"

export function PracticePage() {
  const entrySearch = parsePracticeEntrySearch(useSearch({ strict: false }))
  const state = usePracticeSession(entrySearch)
  const actions = usePracticeActions(
    state.data?.session,
    state.runAction,
    state.blocked,
    state.abandonBlocked,
  )

  if (!state.data) {
    if (state.readError) {
      return (
        <PracticeView
          variant={entrySearch.entry === "history" ? "historyEntryError" : "error"}
          isRetrying={state.isRetrying}
          onRetry={state.retryRead}
        />
      )
    }
    if (state.prerequisite === "profileMissing") {
      return <PracticeView variant="profileRequired" />
    }
    return <PracticeView content={{ status: "loading" }} variant="default" />
  }

  return (
    <PracticeView
      variant="default"
      content={{ status: "ready", data: state.data }}
      answeringActions={actions.answeringActions}
      answeringPending={actions.answeringPending}
      sessionActions={actions.sessionActions}
      sessionPending={actions.sessionPending}
      followUpActions={actions.followUpActions}
      followUpPending={actions.followUpPending}
      reviewActions={actions.reviewActions}
      reviewPending={actions.reviewPending}
      completedActions={{ onPrepareNextRound: state.prepareNextRound }}
      completedPending={state.busy}
      taskError={state.task.data?.task.status === "failed"}
      isTaskRetrying={actions.isTaskRetrying || (state.readError && state.isRetrying)}
      onRetryTask={state.readError ? state.retryRead : actions.retryTask}
      isStarting={state.isStarting || state.blocked}
      onStart={state.start}
      historyEntryResolution={state.historyEntryResolution}
      activeHistoryEntry={state.activeHistoryEntry}
      refreshError={state.readError}
      isRefreshing={state.isRetrying}
      onRefresh={state.retryRead}
    />
  )
}
