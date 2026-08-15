import { useQuery } from "@tanstack/react-query"
import { useParams, useSearch } from "@tanstack/react-router"
import { useMemo, useRef } from "react"

import { env } from "@/app/env"
import { TrainingRecordNotFoundError } from "@/models/training-records"
import { getTargetedPracticeRecord } from "@/services/training-records"

import { trainingRecordCacheTime, trainingRecordQueryKeys } from "./history-query-keys"
import { parseHistorySearch } from "./history-navigation"
import { useHistoryReferenceAnswerGeneration } from "./hooks/useHistoryReferenceAnswerGeneration"
import type { TargetedPracticeHistoryViewState } from "./targeted-practice-history-types"
import { TargetedPracticeHistoryView } from "./TargetedPracticeHistoryView"

export function TargetedPracticeHistoryPage() {
  const { recordId } = useParams({ from: "/app/history/practice/$recordId" })
  const historySearch = parseHistorySearch(useSearch({ strict: false }))
  const retryLock = useRef(false)
  const detailQueryKey = useMemo(
    () => trainingRecordQueryKeys.targetedPracticeDetail(recordId),
    [recordId],
  )
  const query = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => getTargetedPracticeRecord(recordId),
    refetchOnMount: "always",
    retry: false,
    staleTime: trainingRecordCacheTime,
  })
  const referenceAnswerGenerationEnabled =
    env.mock ||
    query.data?.questions.some(
      (question) => !Object.hasOwn(question.referenceAnswer, "viewedBeforeSubmission"),
    ) === true
  const referenceAnswerGeneration = useHistoryReferenceAnswerGeneration({
    detailQueryKey,
    enabled: referenceAnswerGenerationEnabled,
    kind: "targetedPractice",
    record: query.data,
    recordId,
  })

  const state: TargetedPracticeHistoryViewState = query.data
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
    <TargetedPracticeHistoryView
      historySearch={historySearch}
      isReferenceAnswerRequesting={
        referenceAnswerGenerationEnabled ? referenceAnswerGeneration.isRequesting : undefined
      }
      onGenerateReferenceAnswer={
        referenceAnswerGenerationEnabled ? referenceAnswerGeneration.generate : undefined
      }
      onRetry={() => void handleRetry()}
      state={state}
    />
  )
}
