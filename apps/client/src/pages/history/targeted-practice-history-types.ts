import type { TargetedPracticeRecordDetailResponse } from "@/models/training-records"

export type TargetedPracticeHistoryViewState =
  | { status: "loading" }
  | { status: "ready"; data: TargetedPracticeRecordDetailResponse }
  | { status: "error"; isRetrying: boolean }
  | { status: "notFound" }
