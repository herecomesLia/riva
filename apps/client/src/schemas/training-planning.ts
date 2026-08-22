import { z } from "zod"

import type { TrainingPlanningPlan, TrainingPlanningResponse } from "@/models/training-planning"
import type { InteractionLanguage } from "@/types/language"

const identifierSchema = z.string().trim().min(1)
const interactionLanguageSchema: z.ZodType<InteractionLanguage> = z.enum(["zh-CN", "en"])

const targetedPracticePlanSchema = z
  .object({
    action: z.literal("targetedPractice"),
    reason: z.string().trim().min(1).max(2_000),
    focusAreas: z.array(z.string().trim().min(1).max(255)).max(3),
    questionType: z.enum([
      "projectDeepDive",
      "behavioral",
      "businessUnderstanding",
      "motivation",
      "technicalFoundation",
    ]),
    difficulty: z.enum(["basic", "pressure"]),
    prioritizeWeaknesses: z.boolean(),
  })
  .strict()

const mockInterviewPlanSchema = z
  .object({
    action: z.literal("mockInterview"),
    reason: z.string().trim().min(1).max(2_000),
    focusAreas: z.array(z.string().trim().min(1).max(255)).max(3),
    round: z.enum(["hr", "firstBusiness", "technical", "manager", "final", "comprehensive"]),
    difficulty: z.enum(["basic", "pressure"]),
    durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45)]),
  })
  .strict()

export const trainingPlanningPlanSchema = z.discriminatedUnion("action", [
  targetedPracticePlanSchema,
  mockInterviewPlanSchema,
])

export const trainingPlanningResponseSchema = z
  .object({
    targetRoleId: identifierSchema,
    interactionLanguage: interactionLanguageSchema,
    plan: trainingPlanningPlanSchema,
  })
  .strict()

export type TrainingPlanningResponseWire = z.infer<typeof trainingPlanningResponseSchema>

export type TrainingPlanningPlanWire = z.infer<typeof trainingPlanningPlanSchema>

export function parseTrainingPlanningResponse(value: unknown): TrainingPlanningResponse {
  return trainingPlanningResponseSchema.parse(value) as TrainingPlanningResponse
}

export type _TrainingPlanningSchemaTypeCheck =
  TrainingPlanningResponseWire extends TrainingPlanningResponse
    ? TrainingPlanningPlanWire extends TrainingPlanningPlan
      ? true
      : never
    : never
