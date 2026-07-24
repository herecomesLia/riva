import { useQuery } from "@tanstack/react-query"
import { useParams } from "@tanstack/react-router"

import { TrainingRecordNotFoundError } from "@/models/training-records"
import { getTargetedPracticeRecord } from "@/services/training-records"

import type { TargetedPracticeHistoryViewState } from "./targeted-practice-history-types"
import { TargetedPracticeHistoryView } from "./TargetedPracticeHistoryView"

export function TargetedPracticeHistoryPage() {
  const { recordId } = useParams({ from: "/app/history/practice/$recordId" })
  const query = useQuery({
    queryKey: ["training-records", "targeted-practice", recordId],
    queryFn: () => getTargetedPracticeRecord(recordId),
    retry: false,
  })

  const state: TargetedPracticeHistoryViewState = query.data
    ? { status: "ready", data: query.data }
    : query.isFetching
      ? { status: "loading" }
      : query.error instanceof TrainingRecordNotFoundError
        ? { status: "notFound" }
        : { status: "error" }

  return <TargetedPracticeHistoryView onRetry={() => void query.refetch()} state={state} />
}
