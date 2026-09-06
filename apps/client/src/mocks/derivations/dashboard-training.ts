import type { DashboardResponse, DashboardWeaknessCategory } from "@/models/dashboard"
import type {
  TargetedPracticeRecordDetailResponse,
  MockInterviewRecordDetailResponse,
} from "@/models/training-records"

type TrainingRecordDetail = TargetedPracticeRecordDetailResponse | MockInterviewRecordDetailResponse

export const DASHBOARD_REPORTING_PERIOD = {
  current: {
    from: "2026-07-19T00:00:00.000Z",
    to: "2026-07-26T00:00:00.000Z",
  },
  previous: {
    from: "2026-07-12T00:00:00.000Z",
    to: "2026-07-19T00:00:00.000Z",
  },
} as const

type DashboardTrainingData = Pick<
  DashboardResponse,
  "performanceTrend" | "recommendation" | "weaknesses"
> & {
  metrics: Pick<
    DashboardResponse["metrics"],
    "mockInterviewScore" | "practiceTimeMinutes" | "targetedPracticeScore"
  >
}

export function deriveDashboardTrainingData(
  records: TrainingRecordDetail[],
  reportingPeriod = DASHBOARD_REPORTING_PERIOD,
): DashboardTrainingData {
  const sorted = [...records].sort(
    (left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt),
  )
  const currentRecords = sorted.filter((record) =>
    isWithin(record.endedAt, reportingPeriod.current),
  )
  const previousRecords = sorted.filter((record) =>
    isWithin(record.endedAt, reportingPeriod.previous),
  )

  return {
    recommendation: toRecommendation(sorted[0]),
    metrics: {
      practiceTimeMinutes: {
        currentValue: durationMinutes(currentRecords),
        previousValue: durationMinutes(previousRecords),
      },
      targetedPracticeScore: latestScoreSnapshot(sorted, "targetedPractice"),
      mockInterviewScore: latestScoreSnapshot(sorted, "mockInterview"),
    },
    performanceTrend: {
      targetedPractice: performanceRecords(sorted, "targetedPractice"),
      mockInterview: performanceRecords(sorted, "mockInterview"),
    },
    weaknesses: deriveWeaknesses(currentRecords),
  }
}

function latestScoreSnapshot(
  records: TrainingRecordDetail[],
  kind: TrainingRecordDetail["kind"],
): DashboardResponse["metrics"]["targetedPracticeScore"] {
  const scores = records
    .filter((record) => record.kind === kind && record.overallScore !== null)
    .map((record) => record.overallScore as number)

  return {
    currentValue: scores[0] ?? null,
    previousValue: scores[1] ?? null,
  }
}

function performanceRecords(
  records: TrainingRecordDetail[],
  kind: TrainingRecordDetail["kind"],
): DashboardResponse["performanceTrend"]["targetedPractice"] {
  return records
    .filter((record) => record.kind === kind && record.overallScore !== null)
    .slice(0, 10)
    .reverse()
    .map((record) => ({
      id: record.id,
      occurredAt: record.endedAt,
      score: record.overallScore as number,
    }))
}

function durationMinutes(records: TrainingRecordDetail[]): number | null {
  if (records.length === 0) return null
  return Math.round(records.reduce((total, record) => total + record.durationSeconds, 0) / 60)
}

function toRecommendation(
  record: TrainingRecordDetail | undefined,
): DashboardResponse["recommendation"] {
  if (!record?.recommendation || record.recommendation.action === "none") return null
  const estimatedMinutes =
    record.recommendation.action === "mockInterview"
      ? 30
      : record.recommendation.action === "retryQuestion"
        ? 8
        : 15

  return {
    id: `dashboard-recommendation-${record.id}`,
    sourceRecordId: record.id,
    targetRoleId: record.targetRole.id,
    recommendation: structuredClone(record.recommendation),
    estimatedMinutes,
  }
}

function deriveWeaknesses(records: TrainingRecordDetail[]): DashboardResponse["weaknesses"] {
  const counts = new Map<
    string,
    { category: DashboardWeaknessCategory; count: number; id: string }
  >()

  for (const record of records) {
    for (const [index, description] of record.exposedWeaknesses.entries()) {
      const current = counts.get(description)
      counts.set(description, {
        category: current?.category ?? weaknessCategory(description),
        count: (current?.count ?? 0) + 1,
        id: current?.id ?? `dashboard-weakness-${record.id}-${index + 1}`,
      })
    }
  }

  return [...counts.entries()].map(([description, value]) => ({
    id: value.id,
    category: value.category,
    description,
    recommendedPracticeCount: value.count,
  }))
}

function weaknessCategory(description: string): DashboardWeaknessCategory {
  if (/压力|临场|追问|风险|pressure|follow.?up|risk/i.test(description)) {
    return "pressureResponse"
  }
  if (/结果|量化|贡献|数据|影响|证据|result|impact|evidence|metric/i.test(description)) {
    return "quantifiedResults"
  }
  return "projectExpression"
}

function isWithin(
  occurredAt: string,
  range: { readonly from: string; readonly to: string },
): boolean {
  const timestamp = Date.parse(occurredAt)
  return timestamp >= Date.parse(range.from) && timestamp < Date.parse(range.to)
}
