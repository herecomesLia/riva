import { z } from "zod"

import type { InteractionLanguage } from "@/types/language"

export const practiceQuestionTypeSchema = z.enum([
  "projectDeepDive",
  "behavioral",
  "businessUnderstanding",
  "motivation",
  "technicalFoundation",
])

export const practiceDifficultySchema = z.enum(["basic", "pressure"])
export const practiceQuestionSourceSchema = z.enum(["personalized", "saved", "history"])
export const practiceMaterialTypeSchema = z.enum(["projectExperience", "workExperience"])

const uuidSchema = z.uuid()
const versionSchema = z.number().int().positive()
const dateTimeSchema = z.iso.datetime({ offset: true })
const interactionLanguageSchema: z.ZodType<InteractionLanguage> = z.enum(["zh-CN", "en"])

export const practiceMaterialReferenceSchema = z
  .object({
    id: uuidSchema,
    label: z.string(),
    reason: z.string(),
    type: practiceMaterialTypeSchema,
  })
  .strict()

export const practiceSessionSelectionSchema = z
  .object({
    difficulty: practiceDifficultySchema,
    prioritizeWeaknesses: z.boolean(),
    questionType: practiceQuestionTypeSchema,
    source: practiceQuestionSourceSchema,
    targetRoleId: uuidSchema,
  })
  .strict()

const practiceGuidanceNotRequestedSchema = z
  .object({
    content: z.null(),
    status: z.literal("notRequested"),
  })
  .strict()

const practiceReferenceAnswerNotRequestedSchema = z
  .object({
    content: z.null(),
    status: z.literal("notRequested"),
    viewedBeforeSubmission: z.literal(false),
  })
  .strict()

export const practiceQuestionSchema = z
  .object({
    answerFramework: practiceGuidanceNotRequestedSchema,
    answerHints: practiceGuidanceNotRequestedSchema,
    assessedCapabilities: z.array(z.string()),
    difficulty: practiceDifficultySchema,
    id: uuidSchema,
    isMarkedWeak: z.boolean(),
    isSaved: z.boolean(),
    prompt: z.string(),
    questionType: practiceQuestionTypeSchema,
    recommendedMaterials: z.array(practiceMaterialReferenceSchema),
    referenceAnswer: practiceReferenceAnswerNotRequestedSchema,
  })
  .strict()

const practiceActiveSessionBaseSchema = z
  .object({
    attemptId: uuidSchema,
    attemptNumber: z.number().int().positive(),
    language: interactionLanguageSchema,
    selection: practiceSessionSelectionSchema,
    sessionId: uuidSchema,
    startedAt: dateTimeSchema,
    version: versionSchema,
  })
  .strict()

export const practiceGeneratingQuestionSchema = practiceActiveSessionBaseSchema
  .extend({ status: z.literal("generatingQuestion") })
  .strict()

export const practiceAnsweringSchema = practiceActiveSessionBaseSchema
  .extend({
    question: practiceQuestionSchema,
    status: z.literal("answering"),
  })
  .strict()

export const practiceActiveSessionResponseSchema = z.discriminatedUnion("status", [
  practiceGeneratingQuestionSchema,
  practiceAnsweringSchema,
])

export const currentPracticeSessionResponseSchema = z
  .object({
    session: practiceActiveSessionResponseSchema.nullable(),
  })
  .strict()

export type PracticeMaterialReferenceWire = z.infer<typeof practiceMaterialReferenceSchema>
export type PracticeSessionSelectionWire = z.infer<typeof practiceSessionSelectionSchema>
export type PracticeQuestionWire = z.infer<typeof practiceQuestionSchema>
export type PracticeGeneratingQuestionWire = z.infer<typeof practiceGeneratingQuestionSchema>
export type PracticeAnsweringWire = z.infer<typeof practiceAnsweringSchema>
export type PracticeActiveSessionWire = z.infer<typeof practiceActiveSessionResponseSchema>
export type CurrentPracticeSessionResponseWire = z.infer<
  typeof currentPracticeSessionResponseSchema
>
