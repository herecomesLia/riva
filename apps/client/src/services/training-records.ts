import { env } from "@/app/env"
import * as trainingRecordsMockService from "@/mocks/services/training-records"
import { TrainingRecordNotFoundError } from "@/models/training-records"
import type {
  ListTrainingRecordsInput,
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordsOverviewResponse,
  TrainingRecordsPageResponse,
  TrainingRecordReferenceAnswerGenerationResponse,
  TrainingRecordReferenceAnswerTarget,
} from "@/models/training-records"
import {
  mockInterviewTrainingRecordDetailResponseSchema,
  targetedPracticeTrainingRecordDetailResponseSchema,
  targetedPracticeTrainingRecordReferenceAnswerResponseSchema,
  trainingRecordsOverviewResponseSchema,
  trainingRecordsPageResponseSchema,
} from "@/schemas/training-records"
import { apiRequest, ApiError } from "@/services/api"
import {
  adaptMockInterviewRecord,
  adaptTargetedPracticeRecord,
  adaptTrainingRecordsOverview,
  adaptTrainingRecordsPage,
} from "@/services/training-records-adapter"

type TargetedPracticeReferenceAnswerTarget = Extract<
  TrainingRecordReferenceAnswerTarget,
  { kind: "targetedPractice" }
>

async function requestTargetedPracticeReferenceAnswer(
  target: TargetedPracticeReferenceAnswerTarget,
): Promise<TrainingRecordReferenceAnswerGenerationResponse> {
  const body =
    target.subject === "mainQuestion"
      ? {
          subject: target.subject,
          questionId: target.questionId,
        }
      : {
          subject: target.subject,
          questionId: target.questionId,
          followUpId: target.followUpId,
        }
  const wire = targetedPracticeTrainingRecordReferenceAnswerResponseSchema.parse(
    await apiRequest<unknown>(
      `/training-records/practice/${encodeURIComponent(target.recordId)}/reference-answer`,
      { method: "POST", json: body },
    ),
  )
  return wire
}

export async function getTrainingRecordsOverview(): Promise<TrainingRecordsOverviewResponse> {
  if (env.mock) return trainingRecordsMockService.getTrainingRecordsOverview()

  const wire = trainingRecordsOverviewResponseSchema.parse(
    await apiRequest<unknown>("/training-records/overview", { method: "GET" }),
  )
  return adaptTrainingRecordsOverview(wire)
}

export async function listTrainingRecords(
  input: ListTrainingRecordsInput,
): Promise<TrainingRecordsPageResponse> {
  if (env.mock) return trainingRecordsMockService.listTrainingRecords(input)

  const query = new URLSearchParams()
  for (const kind of input.kinds ?? []) query.append("kinds", kind)
  for (const status of input.statuses ?? []) query.append("statuses", status)
  if (input.targetRoleId !== undefined) query.set("targetRoleId", input.targetRoleId)
  if (input.startedAtFrom !== undefined) query.set("startedAtFrom", input.startedAtFrom)
  if (input.startedAtTo !== undefined) query.set("startedAtTo", input.startedAtTo)
  query.set("page", String(input.page))
  query.set("pageSize", String(input.pageSize))

  const wire = trainingRecordsPageResponseSchema.parse(
    await apiRequest<unknown>(`/training-records?${query.toString()}`, { method: "GET" }),
  )
  return adaptTrainingRecordsPage(wire)
}

export async function getTargetedPracticeRecord(
  recordId: string,
): Promise<TargetedPracticeRecordDetailResponse> {
  if (env.mock) return trainingRecordsMockService.getTargetedPracticeRecord(recordId)

  try {
    const wire = targetedPracticeTrainingRecordDetailResponseSchema.parse(
      await apiRequest<unknown>(`/training-records/practice/${encodeURIComponent(recordId)}`),
    )
    return adaptTargetedPracticeRecord(wire)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new TrainingRecordNotFoundError("targetedPractice", recordId)
    }
    throw error
  }
}

export async function getMockInterviewRecord(
  recordId: string,
): Promise<MockInterviewRecordDetailResponse> {
  if (env.mock) return trainingRecordsMockService.getMockInterviewRecord(recordId)

  try {
    const wire = mockInterviewTrainingRecordDetailResponseSchema.parse(
      await apiRequest<unknown>(`/training-records/interview/${encodeURIComponent(recordId)}`),
    )
    return adaptMockInterviewRecord(wire)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new TrainingRecordNotFoundError("mockInterview", recordId)
    }
    throw error
  }
}

export async function requestTrainingRecordReferenceAnswer(
  target: TrainingRecordReferenceAnswerTarget,
): Promise<TrainingRecordReferenceAnswerGenerationResponse> {
  if (env.mock) return trainingRecordsMockService.requestTrainingRecordReferenceAnswer(target)
  if (target.kind !== "targetedPractice") {
    throw new Error("Reference answers are not available for mock interviews.")
  }
  return requestTargetedPracticeReferenceAnswer(target)
}
