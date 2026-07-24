import { useQuery } from "@tanstack/react-query"
import { useParams } from "@tanstack/react-router"

import { TrainingRecordNotFoundError } from "@/models/training-records"
import { getMockInterviewRecord } from "@/services/training-records"

import type { MockInterviewHistoryViewState } from "./mock-interview-history-types"
import { MockInterviewHistoryView } from "./MockInterviewHistoryView"

export function MockInterviewHistoryPage() {
  const { recordId } = useParams({ from: "/app/history/interview/$recordId" })
  const query = useQuery({
    queryKey: ["training-records", "mock-interview", recordId],
    queryFn: () => getMockInterviewRecord(recordId),
    retry: false,
  })

  const state: MockInterviewHistoryViewState = query.data
    ? { status: "ready", data: query.data }
    : query.isFetching
      ? { status: "loading" }
      : query.error instanceof TrainingRecordNotFoundError
        ? { status: "notFound" }
        : { status: "error" }

  return <MockInterviewHistoryView onRetry={() => void query.refetch()} state={state} />
}
