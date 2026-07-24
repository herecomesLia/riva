import type { MockInterviewRecordDetailResponse } from "@/models/training-records"

export type MockInterviewHistoryViewState =
  | { status: "loading" }
  | { status: "ready"; data: MockInterviewRecordDetailResponse }
  | { status: "error" }
  | { status: "notFound" }
