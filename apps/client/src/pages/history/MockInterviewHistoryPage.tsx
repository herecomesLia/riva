import { useQuery } from "@tanstack/react-query"
import { useParams, useSearch } from "@tanstack/react-router"
import { useRef } from "react"

import { TrainingRecordNotFoundError } from "@/models/training-records"
import { getMockInterviewRecord } from "@/services/training-records"

import { trainingRecordCacheTime, trainingRecordQueryKeys } from "./history-query-keys"
import { parseHistorySearch } from "./history-navigation"
import { useHistoryReferenceAnswerGeneration } from "./hooks/useHistoryReferenceAnswerGeneration"
import type { MockInterviewHistoryViewState } from "./mock-interview-history-types"
import { MockInterviewHistoryView } from "./MockInterviewHistoryView"

export function MockInterviewHistoryPage() {
  const { recordId } = useParams({ from: "/app/history/interview/$recordId" })
  const historySearch = parseHistorySearch(useSearch({ strict: false }))
  const retryLock = useRef(false)
  const query = useQuery({
    queryKey: trainingRecordQueryKeys.mockInterviewDetail(recordId),
    queryFn: () => getMockInterviewRecord(recordId),
    retry: false,
    staleTime: trainingRecordCacheTime,
  })
  const referenceAnswerGeneration = useHistoryReferenceAnswerGeneration({
    detailQueryKey: trainingRecordQueryKeys.mockInterviewDetail(recordId),
    kind: "mockInterview",
    record: query.data,
    recordId,
  })

  const state: MockInterviewHistoryViewState = query.data
    ? { status: "ready", data: query.data }
    : query.isFetching
      ? { status: "loading" }
      : query.error instanceof TrainingRecordNotFoundError
        ? { status: "notFound" }
        : { status: "error", isRetrying: query.isFetching }

  async function handleRetry() {
    if (retryLock.current || query.isFetching) return
    retryLock.current = true
    try {
      await query.refetch()
    } finally {
      retryLock.current = false
    }
  }

  return (
    <MockInterviewHistoryView
      historySearch={historySearch}
      isReferenceAnswerRequesting={referenceAnswerGeneration.isRequesting}
      onGenerateReferenceAnswer={referenceAnswerGeneration.generate}
      onRetry={() => void handleRetry()}
      state={state}
    />
  )
}
