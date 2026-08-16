import { z } from "zod"

import type { InterviewPageResponse } from "@/models/interview"

const uuidSchema = z.uuid()
const versionSchema = z.number().int().positive()
const dateTimeSchema = z.iso.datetime({ offset: true })

export const interviewQuestionTypeSchema = z.enum([
  "selfIntroduction",
  "projectDeepDive",
  "roleCapability",
  "behavioral",
  "technicalOrBusiness",
  "resumeRisk",
  "motivation",
])
export const interviewRoundSchema = z.enum([
  "hr",
  "firstBusiness",
  "technical",
  "manager",
  "final",
  "comprehensive",
])
export const interviewDifficultySchema = z.enum(["basic", "pressure"])
export const interviewDurationMinutesSchema = z.union([z.literal(15), z.literal(30), z.literal(45)])
export const interactionLanguageSchema = z.enum(["zh-CN", "en"])

export const interviewConfigurationSchema = z
  .object({
    targetRoleId: uuidSchema,
    round: interviewRoundSchema,
    difficulty: interviewDifficultySchema,
    durationMinutes: interviewDurationMinutesSchema,
  })
  .strict()

export const interviewQuestionSchema = z
  .object({
    id: uuidSchema,
    prompt: z.string().trim().min(1).max(255),
    type: interviewQuestionTypeSchema,
    assessedCapabilities: z.array(z.string().trim().min(1).max(255)),
    order: z.number().int().positive(),
  })
  .strict()

const interviewAnswerSchema = z
  .object({
    id: uuidSchema,
    content: z.string().trim().min(1).max(20_000),
    submittedAt: dateTimeSchema,
  })
  .strict()

const interviewFollowUpQuestionSchema = z
  .object({
    id: uuidSchema,
    parentQuestionId: uuidSchema,
    prompt: z.string().trim().min(1).max(4_000),
    order: z.number().int().positive(),
    createdAt: dateTimeSchema,
  })
  .strict()

const interviewAnsweredFollowUpSchema = z
  .object({
    status: z.literal("answered"),
    question: interviewFollowUpQuestionSchema,
    answer: interviewAnswerSchema,
  })
  .strict()

const interviewCompletedQuestionSchema = z
  .object({
    question: interviewQuestionSchema,
    answer: interviewAnswerSchema,
    followUps: z.array(interviewAnsweredFollowUpSchema),
    completedAt: dateTimeSchema,
  })
  .strict()

const interviewProgressSchema = z
  .object({
    completedMainQuestions: z.number().int().nonnegative(),
    totalMainQuestions: z.number().int().positive().nullable(),
    planRevision: z.number().int().nonnegative(),
  })
  .strict()

const interviewSetupSchema = z
  .object({
    availability: z.discriminatedUnion("status", [
      z.object({ status: z.literal("available") }).strict(),
      z
        .object({
          status: z.literal("blocked"),
          reason: z.enum(["profileIncomplete", "jobDescriptionMissing"]),
        })
        .strict(),
    ]),
    targetRoles: z.array(
      z
        .object({
          id: uuidSchema,
          title: z.string().trim().min(1).max(255),
          company: z.string().max(255).nullable(),
          supportedRounds: z.tuple([interviewRoundSchema]).rest(interviewRoundSchema),
        })
        .strict(),
    ),
    availableDifficulties: z.tuple([interviewDifficultySchema]).rest(interviewDifficultySchema),
    availableDurationMinutes: z
      .tuple([interviewDurationMinutesSchema])
      .rest(interviewDurationMinutesSchema),
    defaultConfiguration: interviewConfigurationSchema
      .extend({ targetRoleId: uuidSchema.nullable() })
      .strict(),
  })
  .strict()

const sessionBaseSchema = z
  .object({
    sessionId: uuidSchema,
    language: interactionLanguageSchema,
    version: versionSchema,
    configuration: interviewConfigurationSchema,
    startedAt: dateTimeSchema,
    progress: interviewProgressSchema,
    completedQuestions: z.array(interviewCompletedQuestionSchema),
  })
  .strict()

export const interviewOpeningSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("opening"),
    openingMessage: z.string().trim().min(1).max(255),
  })
  .strict()

export const interviewGeneratingQuestionSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("generatingQuestion"),
    generationStatus: z.enum(["generating", "failed"]),
  })
  .strict()

const awaitingQuestionSchema = z
  .object({
    status: z.literal("awaitingAnswer"),
    question: interviewQuestionSchema,
    answer: z.null(),
  })
  .strict()

export const interviewQuestionSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("question"),
    currentQuestion: awaitingQuestionSchema,
  })
  .strict()

const answeredQuestionSnapshotSchema = z
  .object({
    question: interviewQuestionSchema,
    answer: interviewAnswerSchema,
    answeredFollowUps: z.array(interviewAnsweredFollowUpSchema),
  })
  .strict()

export const interviewGeneratingTurnSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("generatingTurn"),
    generationStatus: z.enum(["generating", "failed"]),
    currentQuestion: answeredQuestionSnapshotSchema,
  })
  .strict()

const awaitingFollowUpSchema = z
  .object({
    status: z.literal("awaitingAnswer"),
    question: interviewFollowUpQuestionSchema,
    answer: z.null(),
  })
  .strict()

export const interviewFollowUpSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("followUp"),
    currentQuestion: answeredQuestionSnapshotSchema,
    currentFollowUp: awaitingFollowUpSchema,
  })
  .strict()

export const interviewCandidateQuestionsSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("candidateQuestions"),
    prompt: z.string().trim().min(1).max(255),
    exchanges: z.array(z.unknown()),
  })
  .strict()

export const interviewSessionSchema = z.discriminatedUnion("status", [
  interviewOpeningSessionSchema,
  interviewGeneratingQuestionSessionSchema,
  interviewQuestionSessionSchema,
  interviewGeneratingTurnSessionSchema,
  interviewFollowUpSessionSchema,
  interviewCandidateQuestionsSessionSchema,
])

export const interviewPageResponseSchema: z.ZodType<
  Omit<InterviewPageResponse, "session"> & {
    session: z.infer<typeof interviewSessionSchema> | null
  }
> = z
  .object({
    setup: interviewSetupSchema,
    session: interviewSessionSchema.nullable(),
  })
  .strict()

export type InterviewPageWireResponse = z.infer<typeof interviewPageResponseSchema>
