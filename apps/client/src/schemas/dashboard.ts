import { z } from "zod"

const uuidSchema = z.uuid()
const dateTimeSchema = z.iso.datetime({ offset: true })

const scoreMetricSnapshotSchema = z
  .object({
    currentValue: z.number().min(0).max(100).nullable(),
    previousValue: z.number().min(0).max(100).nullable(),
  })
  .strict()

const durationMetricSnapshotSchema = z
  .object({
    currentValue: z.number().int().nonnegative().nullable(),
    previousValue: z.number().int().nonnegative().nullable(),
  })
  .strict()

export const dashboardMetricSnapshotSchema = z
  .object({
    currentValue: z.number().nonnegative().nullable(),
    previousValue: z.number().nonnegative().nullable(),
  })
  .strict()

export const dashboardPerformanceRecordSchema = z
  .object({
    id: uuidSchema,
    occurredAt: dateTimeSchema,
    score: z.number().min(0).max(100),
  })
  .strict()

export const dashboardCurrentRoleSchema = z
  .object({
    id: uuidSchema,
    title: z.string(),
    company: z.string().nullable(),
    recruitmentType: z.enum(["campus", "experienced"]).nullable(),
    location: z.string().nullable(),
    experienceYears: z
      .object({
        min: z.number().int().nonnegative().nullable(),
        max: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
    profileCompleted: z.boolean(),
    jobDescriptionAdded: z.boolean(),
  })
  .strict()
  .nullable()

const dashboardWeaknessSchema = z
  .object({
    id: uuidSchema,
    category: z.enum(["projectExpression", "quantifiedResults", "pressureResponse"]),
    description: z.string(),
    recommendedPracticeCount: z.number().int().min(1).max(3),
  })
  .strict()

const recommendationQuestionTypeSchema = z.enum([
  "selfIntroduction",
  "projectDeepDive",
  "roleCapability",
  "behavioral",
  "technicalOrBusiness",
  "businessUnderstanding",
  "technicalFoundation",
  "resumeRisk",
  "motivation",
])

const targetedPracticeRecommendationSchema = z
  .object({
    action: z.literal("targetedPractice"),
    reason: z.string(),
    questionType: recommendationQuestionTypeSchema,
    difficulty: z.enum(["basic", "pressure"]),
    focusAreas: z.array(z.string()).max(3),
  })
  .strict()

const mockInterviewRecommendationSchema = z
  .object({
    action: z.literal("mockInterview"),
    reason: z.string(),
    round: z.enum(["hr", "firstBusiness", "technical", "manager", "final", "comprehensive"]),
    difficulty: z.enum(["basic", "pressure"]),
    focusAreas: z.array(z.string()).max(3),
  })
  .strict()

export const dashboardRecommendationSchema = z.discriminatedUnion("action", [
  targetedPracticeRecommendationSchema,
  mockInterviewRecommendationSchema,
])

export const dashboardRecommendationResponseSchema = z
  .object({
    id: uuidSchema,
    sourceRecordId: uuidSchema,
    targetRoleId: uuidSchema,
    recommendation: dashboardRecommendationSchema,
    estimatedMinutes: z.number().int().nonnegative(),
  })
  .strict()

export const dashboardResponseSchema = z
  .object({
    currentRole: dashboardCurrentRoleSchema,
    recommendation: dashboardRecommendationResponseSchema.nullable(),
    metrics: z
      .object({
        roleFit: scoreMetricSnapshotSchema,
        practiceTimeMinutes: durationMetricSnapshotSchema,
        targetedPracticeScore: scoreMetricSnapshotSchema,
        mockInterviewScore: scoreMetricSnapshotSchema,
      })
      .strict(),
    performanceTrend: z
      .object({
        targetedPractice: z.array(dashboardPerformanceRecordSchema),
        mockInterview: z.array(dashboardPerformanceRecordSchema),
      })
      .strict(),
    weaknesses: z.array(dashboardWeaknessSchema),
  })
  .strict()

export type DashboardResponseWire = z.infer<typeof dashboardResponseSchema>
export type DashboardMetricSnapshotWire = z.infer<typeof dashboardMetricSnapshotSchema>
export type DashboardPerformanceRecordWire = z.infer<typeof dashboardPerformanceRecordSchema>
export type DashboardRecommendationWire = z.infer<typeof dashboardRecommendationSchema>
export type DashboardRecommendationResponseWire = z.infer<
  typeof dashboardRecommendationResponseSchema
>
