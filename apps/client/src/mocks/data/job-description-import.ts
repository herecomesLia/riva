import type { JobDescriptionImportDraft } from "@/services/job-description-import"

export type JobDescriptionImportDraftMockStatus = "parsing" | "ready" | "failed"

export function createJobDescriptionImportDraftFixture(
  status: JobDescriptionImportDraftMockStatus,
  overrides: Partial<JobDescriptionImportDraft> = {},
): JobDescriptionImportDraft {
  const isReady = status === "ready"
  const isFailed = status === "failed"

  return {
    agentRunId: "20000000-0000-4000-8000-000000000002",
    appliedRoleId: null,
    canApply: isReady,
    createdAt: "2026-08-21T08:00:00.000Z",
    failureReason: isFailed ? "无法从这段文本中识别完整的岗位信息。" : null,
    id: "20000000-0000-4000-8000-000000000001",
    parsedCompany: isReady ? "Riva" : null,
    parsedDescription: isReady
      ? "负责构建可靠的产品体验，与产品和工程团队协作交付关键项目。"
      : null,
    parsedLocation: isReady ? "上海" : null,
    parsedTitle: isReady ? "高级前端工程师" : null,
    rawText:
      "Riva 正在招聘高级前端工程师，工作地点上海。负责构建可靠的产品体验，与产品和工程团队协作交付关键项目。",
    status,
    updatedAt: "2026-08-21T08:00:05.000Z",
    ...overrides,
  }
}
