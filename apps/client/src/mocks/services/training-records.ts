import {
  getTrainingRecordSnapshot,
  listTrainingRecordSnapshots,
  resetTrainingRecordsRepository,
  updateTrainingRecordSnapshot,
  type TrainingRecordsRepositoryScenario,
} from "@/mocks/repositories/training-records"
import { waitForMockDelay } from "@/mocks/utils"
import {
  TrainingRecordNotFoundError,
  type ListTrainingRecordsInput,
  type MockInterviewRecordDetailResponse,
  type TargetedPracticeRecordDetailResponse,
  type TrainingRecordKind,
  type TrainingRecordQuestion,
  type TrainingRecordReferenceAnswer,
  TrainingRecordReferenceAnswerGenerationError,
  type TrainingRecordReferenceAnswerGenerationResponse,
  type TrainingRecordReferenceAnswerTarget,
  type TrainingRecordsOverviewResponse,
  type TrainingRecordsPageResponse,
  type TrainingRecordStatus,
  type TrainingRecordSummary,
} from "@/models/training-records"

type TrainingRecordDetail = TargetedPracticeRecordDetailResponse | MockInterviewRecordDetailResponse

export type TrainingRecordReferenceAnswerMockOutcome =
  "ready" | "generationFailed" | "insufficientContext"

export type TrainingRecordsMockControllerOptions = {
  referenceAnswerOutcome?: TrainingRecordReferenceAnswerMockOutcome
  referenceAnswerPollsBeforeCompletion?: number
}

type ReferenceGenerationState = {
  outcome: TrainingRecordReferenceAnswerMockOutcome
  pollsRemaining: number
}

let referenceAnswerOutcome: TrainingRecordReferenceAnswerMockOutcome = "ready"
let referenceAnswerPollsBeforeCompletion = 1
let referenceAnswerGenerationSequence = 0
const referenceGenerations = new Map<string, ReferenceGenerationState>()

function copy<T>(value: T): T {
  return structuredClone(value)
}

export function resetTrainingRecordsMockState(
  scenario: TrainingRecordsRepositoryScenario = "default",
  controller: TrainingRecordsMockControllerOptions = {},
): void {
  if (
    controller.referenceAnswerPollsBeforeCompletion !== undefined &&
    (!Number.isInteger(controller.referenceAnswerPollsBeforeCompletion) ||
      controller.referenceAnswerPollsBeforeCompletion < 0)
  ) {
    throw new Error("Reference-answer poll count must be a non-negative integer.")
  }
  resetTrainingRecordsRepository(scenario)
  referenceAnswerOutcome = controller.referenceAnswerOutcome ?? "ready"
  referenceAnswerPollsBeforeCompletion = controller.referenceAnswerPollsBeforeCompletion ?? 1
  referenceAnswerGenerationSequence = 0
  referenceGenerations.clear()
}

function targetKey(target: TrainingRecordReferenceAnswerTarget): string {
  return [
    target.kind,
    target.recordId,
    target.questionId,
    target.subject,
    target.subject === "followUp" ? target.followUpId : "",
  ].join(":")
}

function findTarget(target: TrainingRecordReferenceAnswerTarget): {
  record: TrainingRecordDetail
  question: TrainingRecordQuestion
  referenceAnswer: TrainingRecordReferenceAnswer
  prompt: string
} {
  const record = getTrainingRecordSnapshot(target.recordId)
  if (!record || record.kind !== target.kind) {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "recordNotFound",
      "Training record does not exist.",
    )
  }
  const question = record.questions.find(({ id }) => id === target.questionId)
  if (!question) {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "questionNotFound",
      "Training-record question does not exist.",
    )
  }
  if (target.subject === "mainQuestion") {
    return { record, question, referenceAnswer: question.referenceAnswer, prompt: question.prompt }
  }
  const followUp = question.followUps.find(({ id }) => id === target.followUpId)
  if (!followUp) {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "followUpNotFound",
      "Training-record follow-up does not exist.",
    )
  }
  return {
    record,
    question,
    referenceAnswer: followUp.referenceAnswer,
    prompt: followUp.prompt,
  }
}

function updateTargetReferenceAnswer(
  target: TrainingRecordReferenceAnswerTarget,
  referenceAnswer: TrainingRecordReferenceAnswer,
): TrainingRecordReferenceAnswerGenerationResponse {
  const updated = updateTrainingRecordSnapshot(target.recordId, (record) => ({
    ...record,
    questions: record.questions.map((question) =>
      question.id !== target.questionId
        ? question
        : target.subject === "mainQuestion"
          ? { ...question, referenceAnswer }
          : {
              ...question,
              followUps: question.followUps.map((followUp) =>
                followUp.id === target.followUpId ? { ...followUp, referenceAnswer } : followUp,
              ),
            },
    ),
  }))
  if (!updated) {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "recordNotFound",
      "Training record does not exist.",
    )
  }
  return { target: copy(target), referenceAnswer: copy(referenceAnswer) }
}

function readyReferenceAnswer(
  target: TrainingRecordReferenceAnswerTarget,
  prompt: string,
): TrainingRecordReferenceAnswer {
  referenceAnswerGenerationSequence += 1
  const subject = target.subject === "mainQuestion" ? "主问题" : "追问"
  return {
    status: "ready",
    content: {
      recommendedStructure: ["先给出明确结论", "补充具体情境与个人行动", "用结果和复盘收束"],
      keyPoints: ["紧扣岗位要求", "说明个人贡献与关键取舍", "提供可验证的结果"],
      exampleAnswer: `针对${subject}“${prompt}”，我会先说明结论，再结合具体经历解释自己的判断、行动和取舍，最后用结果与复盘证明这套做法能够迁移到目标岗位。`,
      usageGuidance: "请结合自己的真实经历改写，不要直接背诵示例。",
      generatedAt: new Date(
        Date.UTC(2026, 6, 25, 8, referenceAnswerGenerationSequence),
      ).toISOString(),
    },
  }
}

export async function requestTrainingRecordReferenceAnswer(
  target: TrainingRecordReferenceAnswerTarget,
): Promise<TrainingRecordReferenceAnswerGenerationResponse> {
  await waitForMockDelay()
  const { referenceAnswer } = findTarget(target)
  if (referenceAnswer.status === "generating") {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "alreadyGenerating",
      "Reference answer generation is already in progress.",
    )
  }
  if (referenceAnswer.status === "ready") {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "alreadyReady",
      "Reference answer is already ready.",
    )
  }
  if (
    referenceAnswer.status === "unavailable" &&
    referenceAnswer.reason === "insufficientContext"
  ) {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "insufficientContext",
      "Reference answer cannot be retried without sufficient context.",
    )
  }

  referenceGenerations.set(targetKey(target), {
    outcome: referenceAnswerOutcome,
    pollsRemaining: referenceAnswerPollsBeforeCompletion,
  })
  return updateTargetReferenceAnswer(target, { status: "generating", content: null })
}

export async function getTrainingRecordReferenceAnswerGenerationStatus(
  target: TrainingRecordReferenceAnswerTarget,
): Promise<TrainingRecordReferenceAnswerGenerationResponse> {
  await waitForMockDelay()
  const located = findTarget(target)
  if (located.referenceAnswer.status !== "generating") {
    return { target: copy(target), referenceAnswer: copy(located.referenceAnswer) }
  }

  const key = targetKey(target)
  const generation = referenceGenerations.get(key) ?? {
    outcome: referenceAnswerOutcome,
    pollsRemaining: referenceAnswerPollsBeforeCompletion,
  }
  if (generation.pollsRemaining > 0) {
    referenceGenerations.set(key, {
      ...generation,
      pollsRemaining: generation.pollsRemaining - 1,
    })
    return { target: copy(target), referenceAnswer: copy(located.referenceAnswer) }
  }

  referenceGenerations.delete(key)
  return updateTargetReferenceAnswer(
    target,
    generation.outcome === "ready"
      ? readyReferenceAnswer(target, located.prompt)
      : {
          status: "unavailable",
          content: null,
          reason: generation.outcome,
        },
  )
}

function toSummary(record: TrainingRecordDetail): TrainingRecordSummary {
  const base = {
    id: record.id,
    language: record.language,
    status: record.status,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    durationSeconds: record.durationSeconds,
    targetRole: record.targetRole,
    answeredQuestionCount: record.answeredQuestionCount,
    totalQuestionCount: record.totalQuestionCount,
    overallScore: record.overallScore,
    reviewSummary:
      record.kind === "targetedPractice"
        ? (record.questions.find((question) => question.review)?.review?.summary ?? null)
        : (record.overallReview.content?.summary ?? null),
  }

  return record.kind === "targetedPractice"
    ? {
        ...base,
        kind: record.kind,
        questionType: record.setup.questionType,
        difficulty: record.setup.difficulty,
      }
    : {
        ...base,
        kind: record.kind,
        round: record.setup.round,
        difficulty: record.setup.difficulty,
      }
}

function averageScore(items: TrainingRecordDetail[]): number | null {
  const scores = items.flatMap((record) =>
    record.overallScore === null ? [] : [record.overallScore],
  )
  if (scores.length === 0) return null
  return Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 10) / 10
}

function kindOverview(
  records: TrainingRecordDetail[],
  kind: TrainingRecordKind,
): TrainingRecordsOverviewResponse["byKind"][TrainingRecordKind] {
  const matching = records.filter((record) => record.kind === kind)
  return {
    recordCount: matching.length,
    completedRecordCount: matching.filter((record) => record.status === "completed").length,
    averageScore: averageScore(matching),
  }
}

export async function getTrainingRecordsOverview(): Promise<TrainingRecordsOverviewResponse> {
  await waitForMockDelay()
  const records = listTrainingRecordSnapshots()

  const targetRoles = [
    ...new Map(records.map((record) => [record.targetRole.id, record.targetRole])).values(),
  ].toSorted((left, right) => left.id.localeCompare(right.id))

  return copy({
    totalRecordCount: records.length,
    completedRecordCount: records.filter((record) => record.status === "completed").length,
    totalDurationSeconds: records.reduce((total, record) => total + record.durationSeconds, 0),
    answeredQuestionCount: records.reduce(
      (total, record) => total + record.answeredQuestionCount,
      0,
    ),
    averageScore: averageScore(records),
    targetRoles,
    byKind: {
      targetedPractice: kindOverview(records, "targetedPractice"),
      mockInterview: kindOverview(records, "mockInterview"),
    },
  })
}

function assertPagination(input: ListTrainingRecordsInput): void {
  if (!Number.isInteger(input.page) || input.page < 1) {
    throw new Error("Training records page must be a positive integer.")
  }
  if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
    throw new Error("Training records page size must be an integer between 1 and 100.")
  }
}

function includesKind(kinds: TrainingRecordKind[] | undefined, kind: TrainingRecordKind): boolean {
  return !kinds || kinds.length === 0 || kinds.includes(kind)
}

function includesStatus(
  statuses: TrainingRecordStatus[] | undefined,
  status: TrainingRecordStatus,
): boolean {
  return !statuses || statuses.length === 0 || statuses.includes(status)
}

export async function listTrainingRecords(
  input: ListTrainingRecordsInput,
): Promise<TrainingRecordsPageResponse> {
  assertPagination(input)
  await waitForMockDelay()
  const records = listTrainingRecordSnapshots()

  const filtered = records
    .filter((record) => includesKind(input.kinds, record.kind))
    .filter((record) => includesStatus(input.statuses, record.status))
    .filter((record) => !input.targetRoleId || record.targetRole.id === input.targetRoleId)
    .filter((record) => !input.startedAtFrom || record.startedAt >= input.startedAtFrom)
    .filter((record) => !input.startedAtTo || record.startedAt <= input.startedAtTo)
    .toSorted((left, right) => right.startedAt.localeCompare(left.startedAt))

  const totalItems = filtered.length
  const offset = (input.page - 1) * input.pageSize

  return copy({
    items: filtered.slice(offset, offset + input.pageSize).map(toSummary),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / input.pageSize),
    },
  })
}

export async function getTargetedPracticeRecord(
  recordId: string,
): Promise<TargetedPracticeRecordDetailResponse> {
  await waitForMockDelay()
  const record = getTrainingRecordSnapshot(recordId)
  if (!record || record.kind !== "targetedPractice") {
    throw new TrainingRecordNotFoundError("targetedPractice", recordId)
  }
  return copy(record)
}

export async function getMockInterviewRecord(
  recordId: string,
): Promise<MockInterviewRecordDetailResponse> {
  await waitForMockDelay()
  const record = getTrainingRecordSnapshot(recordId)
  if (!record || record.kind !== "mockInterview") {
    throw new TrainingRecordNotFoundError("mockInterview", recordId)
  }
  return copy(record)
}
