import type {
  TrainingRecordKind,
  TrainingRecordsOverviewResponse,
  TrainingRecordsPageResponse,
} from "@/models/training-records"

export type HistoryKindFilter = "all" | TrainingRecordKind

export type HistoryTimeRange = "all" | "last7Days" | "last30Days" | "last90Days"

export type HistoryFiltersValue = {
  kind: HistoryKindFilter
  targetRoleId: string
  timeRange: HistoryTimeRange
}

export type HistoryReadyData = {
  overview: TrainingRecordsOverviewResponse
  records: TrainingRecordsPageResponse
}

export type HistoryViewState =
  | { status: "loading" }
  | { status: "ready"; data: HistoryReadyData }
  | {
      status: "empty"
      reason: "neverTrained" | "noMatches"
      data: HistoryReadyData
    }
  | { status: "error" }
