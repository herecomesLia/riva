import { z } from "zod"

import {
  practiceAnswerSchema,
  practiceDifficultySchema,
  practiceEvaluationSchema,
  practiceFollowUpReferenceAnswerStateSchema,
  practiceMainReferenceAnswerStateSchema,
  practiceQuestionTypeSchema,
  practiceQuestionSourceSchema,
  practiceRecommendationSchema,
} from "@/schemas/practice"

const uuidSchema = z.uuid()
const dateTimeSchema = z.iso.datetime({ offset: true })
const interactionLanguageSchema = z.enum(["zh-CN", "en"])

export const targetedPracticeTrainingRecordTargetRoleSchema = z
  .object({
    id: uuidSchema,
    title: z.string().min(1),
    company: z.string().nullable(),
  })
  .strict()

export const targetedPracticeTrainingRecordSetupSchema = z
  .object({
    source: practiceQuestionSourceSchema,
    prioritizeWeaknesses: z.boolean(),
  })
  .strict()

export const targetedPracticeTrainingRecordQuestionSchema = z
  .object({
    questionCardId: uuidSchema,
    prompt: z.string().min(1),
    questionType: practiceQuestionTypeSchema,
    difficulty: practiceDifficultySchema,
    assessedCapabilities: z.array(z.string()),
    isSaved: z.boolean(),
    isMarkedWeak: z.boolean(),
    referenceAnswer: practiceMainReferenceAnswerStateSchema,
  })
  .strict()

export const targetedPracticeTrainingRecordFollowUpSchema = z
  .object({
    questionId: uuidSchema,
    prompt: z.string().min(1),
    order: z.number().int().min(1).max(2),
    askedAt: dateTimeSchema,
    answer: practiceAnswerSchema.nullable(),
    referenceAnswer: practiceFollowUpReferenceAnswerStateSchema,
  })
  .strict()

export const targetedPracticeTrainingRecordEvaluationSchema = practiceEvaluationSchema

export const targetedPracticeTrainingRecordReviewSchema = z
  .object({
    overallPerformance: z.string().min(1),
    highlights: z.array(z.string()),
    mainIssues: z.array(z.string()),
    improvementSuggestions: z.array(z.string()),
    reusableAnswerStructure: z.array(z.string()),
    exposedWeaknesses: z.array(z.string()),
  })
  .strict()

export const targetedPracticeTrainingRecordAttemptSchema = z
  .object({
    attemptId: uuidSchema,
    attemptNumber: z.number().int().min(1),
    retryOfAttemptId: uuidSchema.nullable(),
    completedAt: dateTimeSchema.nullable(),
    question: targetedPracticeTrainingRecordQuestionSchema,
    mainAnswer: practiceAnswerSchema.nullable(),
    followUps: z.array(targetedPracticeTrainingRecordFollowUpSchema),
    evaluation: targetedPracticeTrainingRecordEvaluationSchema.nullable(),
    review: targetedPracticeTrainingRecordReviewSchema.nullable(),
    recommendation: practiceRecommendationSchema.nullable(),
  })
  .strict()

export const targetedPracticeTrainingRecordDetailResponseSchema = z
  .object({
    recordId: uuidSchema,
    kind: z.literal("targetedPractice"),
    status: z.enum(["completed", "endedEarly", "partiallyCompleted"]),
    language: interactionLanguageSchema,
    startedAt: dateTimeSchema,
    endedAt: dateTimeSchema,
    durationSeconds: z.number().int().nonnegative(),
    targetRole: targetedPracticeTrainingRecordTargetRoleSchema,
    setup: targetedPracticeTrainingRecordSetupSchema,
    attempts: z.array(targetedPracticeTrainingRecordAttemptSchema).min(1),
    exposedWeaknesses: z.array(z.string()),
    recommendation: practiceRecommendationSchema.nullable(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.endedAt < record.startedAt) {
      context.addIssue({
        code: "custom",
        message: "endedAt cannot be before startedAt",
        path: ["endedAt"],
      })
    }
    const attemptNumbers = record.attempts.map((attempt) => attempt.attemptNumber)
    if (!attemptNumbers.every((number, index) => number === index + 1)) {
      context.addIssue({
        code: "custom",
        message: "attempt numbers must be contiguous and ordered",
        path: ["attempts"],
      })
    }
  })

export type TargetedPracticeTrainingRecordTargetRoleWire = z.infer<
  typeof targetedPracticeTrainingRecordTargetRoleSchema
>
export type TargetedPracticeTrainingRecordSetupWire = z.infer<
  typeof targetedPracticeTrainingRecordSetupSchema
>
export type TargetedPracticeTrainingRecordQuestionWire = z.infer<
  typeof targetedPracticeTrainingRecordQuestionSchema
>
export type TargetedPracticeTrainingRecordFollowUpWire = z.infer<
  typeof targetedPracticeTrainingRecordFollowUpSchema
>
export type TargetedPracticeTrainingRecordEvaluationWire = z.infer<
  typeof targetedPracticeTrainingRecordEvaluationSchema
>
export type TargetedPracticeTrainingRecordReviewWire = z.infer<
  typeof targetedPracticeTrainingRecordReviewSchema
>
export type TargetedPracticeTrainingRecordAttemptWire = z.infer<
  typeof targetedPracticeTrainingRecordAttemptSchema
>
export type TargetedPracticeTrainingRecordDetailWire = z.infer<
  typeof targetedPracticeTrainingRecordDetailResponseSchema
>

export const targetedPracticeRecordWireSchema = targetedPracticeTrainingRecordDetailResponseSchema

// Record-specific wire names keep the boundary discoverable without duplicating schemas.
export const trainingRecordTargetRoleSchema = targetedPracticeTrainingRecordTargetRoleSchema
export const targetedPracticeSetupWireSchema = targetedPracticeTrainingRecordSetupSchema
export const targetedPracticeQuestionWireSchema = targetedPracticeTrainingRecordQuestionSchema
export const trainingRecordFollowUpWireSchema = targetedPracticeTrainingRecordFollowUpSchema
export const trainingRecordEvaluationWireSchema = targetedPracticeTrainingRecordEvaluationSchema
export const trainingRecordReviewWireSchema = targetedPracticeTrainingRecordReviewSchema
export const targetedPracticeAttemptWireSchema = targetedPracticeTrainingRecordAttemptSchema
