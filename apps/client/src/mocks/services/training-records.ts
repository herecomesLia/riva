import {
  getTrainingRecordSnapshot,
  listTrainingRecordSnapshots,
  resetTrainingRecordsRepository,
  updateTrainingRecordSnapshot,
  type TrainingRecordsRepositoryScenario,
} from "@/mocks/repositories/training-records"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  PracticeFollowUpReferenceAnswerState,
  PracticeReferenceAnswerState,
} from "@/models/practice"
import {
  TrainingRecordNotFoundError,
  type ListTrainingRecordsInput,
  type MockInterviewRecordDetailResponse,
  type TargetedPracticeRecordDetailResponse,
  type TargetedPracticeQuestion,
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
type TrainingRecordQuestionDetail = TrainingRecordQuestion | TargetedPracticeQuestion
type TrainingRecordReferenceAnswerState =
  | TrainingRecordReferenceAnswer
  | PracticeReferenceAnswerState
  | PracticeFollowUpReferenceAnswerState

export type TrainingRecordReferenceAnswerMockOutcome =
  "ready" | "generationFailed" | "insufficientContext"

export type TrainingRecordsMockControllerOptions = {
  referenceAnswerOutcome?: TrainingRecordReferenceAnswerMockOutcome
}

let referenceAnswerOutcome: TrainingRecordReferenceAnswerMockOutcome = "ready"
let referenceAnswerGenerationSequence = 0

function copy<T>(value: T): T {
  return structuredClone(value)
}

export function resetTrainingRecordsMockState(
  scenario: TrainingRecordsRepositoryScenario = "default",
  controller: TrainingRecordsMockControllerOptions = {},
): void {
  resetTrainingRecordsRepository(scenario)
  referenceAnswerOutcome = controller.referenceAnswerOutcome ?? "ready"
  referenceAnswerGenerationSequence = 0
}

function findTarget(target: TrainingRecordReferenceAnswerTarget): {
  record: TrainingRecordDetail
  question: TrainingRecordQuestionDetail
  referenceAnswer: TrainingRecordReferenceAnswerState
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
    return {
      record,
      question,
      referenceAnswer: question.referenceAnswer,
      prompt: question.prompt,
    }
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
  referenceAnswer: TrainingRecordReferenceAnswerState,
): TrainingRecordReferenceAnswerGenerationResponse {
  const updated = updateTrainingRecordSnapshot(target.recordId, (record) => {
    const next = {
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
    }
    return next as TrainingRecordDetail
  })
  if (!updated) {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "recordNotFound",
      "Training record does not exist.",
    )
  }
  return generationResponse(target, referenceAnswer)
}

function generationResponse(
  target: TrainingRecordReferenceAnswerTarget,
  referenceAnswer: TrainingRecordReferenceAnswerState,
): TrainingRecordReferenceAnswerGenerationResponse {
  if (target.kind === "mockInterview") {
    return {
      target: copy(target),
      referenceAnswer: copy(referenceAnswer) as TrainingRecordReferenceAnswer,
    }
  }
  if (target.subject === "mainQuestion") {
    return {
      target: copy(target),
      referenceAnswer: copy(referenceAnswer) as PracticeReferenceAnswerState,
    }
  }
  return {
    target: copy(target),
    referenceAnswer: copy(referenceAnswer) as PracticeFollowUpReferenceAnswerState,
  }
}

function readyReferenceAnswer(
  target: TrainingRecordReferenceAnswerTarget,
  prompt: string,
): TrainingRecordReferenceAnswerState {
  referenceAnswerGenerationSequence += 1
  const subject = target.subject === "mainQuestion" ? "主问题" : "追问"
  if (target.kind === "targetedPractice") {
    if (target.subject === "mainQuestion") {
      return {
        status: "revealed",
        viewedBeforeSubmission: false,
        content: {
          kind: "personalizedExample",
          answer: `针对${subject}“${prompt}”，我会先说明结论，再结合具体经历解释自己的判断、行动和取舍，最后用结果与复盘证明这套做法能够迁移到目标岗位。`,
          keyPoints: ["明确个人贡献", "解释方案取舍"],
          commonMistakes: ["只描述团队工作，不说明个人贡献"],
          generatedAt: new Date(
            Date.UTC(2026, 6, 25, 8, referenceAnswerGenerationSequence),
          ).toISOString(),
        },
      } satisfies PracticeReferenceAnswerState
    }
    return {
      status: "revealed",
      viewedBeforeSubmission: false,
      content: {
        kind: "personalizedSupplement",
        addressedGap: `针对${prompt}补充个人判断、行动和结果证据。`,
        answer: `我会围绕${prompt}补充具体的判断依据、行动边界和结果数据。`,
        keyPoints: ["补充个人贡献", "补充结果证据"],
        commonMistakes: ["只给结论，不解释取舍"],
        generatedAt: new Date(
          Date.UTC(2026, 6, 25, 8, referenceAnswerGenerationSequence),
        ).toISOString(),
      },
    } satisfies PracticeFollowUpReferenceAnswerState
  }
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
  const { prompt, referenceAnswer } = findTarget(target)
  if (referenceAnswer.status === "ready" || referenceAnswer.status === "revealed") {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "alreadyReady",
      "Reference answer is already ready.",
    )
  }
  if (
    referenceAnswer.status === "unavailable" &&
    "reason" in referenceAnswer &&
    referenceAnswer.reason === "insufficientContext"
  ) {
    throw new TrainingRecordReferenceAnswerGenerationError(
      "insufficientContext",
      "Reference answer cannot be retried without sufficient context.",
    )
  }

  return updateTargetReferenceAnswer(
    target,
    referenceAnswerOutcome === "ready"
      ? readyReferenceAnswer(target, prompt)
      : {
          status: "unavailable",
          content: null,
          reason: referenceAnswerOutcome,
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
