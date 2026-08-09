import { z } from "zod"

import type {
  JobDescriptionAnalysis,
  MatchingAnalysis,
  MatchingAnalysisResult,
  ProfileContext,
  QualificationRequirements,
  RequiredSkillGroups,
  RolesPageResponseDto,
  TargetRoleApiDto,
} from "@/models/roles"

const uuidSchema = z.uuid()
const versionSchema = z.number().int().positive()
const dateTimeSchema = z.iso.datetime({ offset: true })
const requiredTextSchema = z.string().trim().min(1).max(255)
const nullableTextSchema = z.string().max(255).nullable()
const analysisItemSchema = z.string().trim().min(1).max(1000)
const analysisItemListSchema = z.array(analysisItemSchema).max(100)

const experienceRangeSchema = z
  .object({
    maxYears: z.number().int().nonnegative().nullable(),
    minYears: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((range, context) => {
    if (range.minYears === null && range.maxYears === null) {
      context.addIssue({ code: "custom", message: "At least one experience bound is required." })
    }
    if (range.minYears !== null && range.maxYears !== null && range.maxYears < range.minYears) {
      context.addIssue({ code: "custom", message: "Maximum experience must not be lower." })
    }
  })

const jobDescriptionSchema = z.discriminatedUnion("status", [
  z
    .object({
      parsingFailureReason: z.null(),
      rawText: z.null(),
      status: z.literal("missing"),
      version: z.null(),
    })
    .strict(),
  z
    .object({
      parsingFailureReason: z.null(),
      rawText: z.string().trim().min(1).max(50_000),
      status: z.literal("saved"),
      version: versionSchema,
    })
    .strict(),
  z
    .object({
      parsingFailureReason: z.null(),
      rawText: z.string().trim().min(1).max(50_000),
      status: z.literal("parsing"),
      version: versionSchema,
    })
    .strict(),
  z
    .object({
      parsingFailureReason: z.null(),
      rawText: z.string().trim().min(1).max(50_000),
      status: z.literal("ready"),
      version: versionSchema,
    })
    .strict(),
  z
    .object({
      parsingFailureReason: requiredTextSchema,
      rawText: z.string().trim().min(1).max(50_000),
      status: z.literal("failed"),
      version: versionSchema,
    })
    .strict(),
])

const qualificationRequirementsSchema: z.ZodType<QualificationRequirements> = z
  .object({
    certifications: analysisItemListSchema,
    education: analysisItemListSchema,
    experience: analysisItemListSchema,
    graduationCohorts: analysisItemListSchema,
    languages: analysisItemListSchema,
    majors: analysisItemListSchema,
    other: analysisItemListSchema,
  })
  .strict()

const requiredSkillGroupsSchema: z.ZodType<RequiredSkillGroups> = z
  .object({
    conceptsAndMethods: analysisItemListSchema,
    databasesAndMiddleware: analysisItemListSchema,
    frameworksAndLibraries: analysisItemListSchema,
    other: analysisItemListSchema,
    platforms: analysisItemListSchema,
    programmingLanguages: analysisItemListSchema,
    tools: analysisItemListSchema,
  })
  .strict()

const jobDescriptionAnalysisSchema: z.ZodType<JobDescriptionAnalysis> = z
  .object({
    analysisVersion: versionSchema,
    businessDomains: analysisItemListSchema,
    jobDescriptionVersion: versionSchema,
    parsedAt: dateTimeSchema,
    preferredQualifications: analysisItemListSchema,
    qualificationRequirements: qualificationRequirementsSchema,
    requiredSkills: requiredSkillGroupsSchema,
    responsibilities: analysisItemListSchema,
    rivaSummary: z.string().trim().min(1).max(2_000),
    softSkills: analysisItemListSchema,
  })
  .strict()

const matchingAnalysisResultSchema: z.ZodType<MatchingAnalysisResult> = z
  .object({
    coreRequirementsSummary: z.string().trim().min(1).max(2_000),
    highRiskQuestions: analysisItemListSchema,
    matchedCapabilities: analysisItemListSchema,
    missingCapabilities: analysisItemListSchema,
    overallMatchScore: z.number().int().min(0).max(100),
    preparationRecommendations: analysisItemListSchema,
    resumeGaps: analysisItemListSchema,
    resumeHighlights: analysisItemListSchema,
    underrepresentedCapabilities: analysisItemListSchema,
  })
  .strict()

const matchingAnalysisVersionContextSchema = z
  .object({
    jobDescriptionAnalysisVersion: versionSchema,
    jobDescriptionVersion: versionSchema,
    profileVersion: versionSchema,
  })
  .strict()

const matchingAnalysisSchema: z.ZodType<MatchingAnalysis> = z.discriminatedUnion("status", [
  matchingAnalysisVersionContextSchema
    .extend({
      failureReason: z.null(),
      generatedAt: z.null(),
      result: z.null(),
      status: z.literal("generating"),
    })
    .strict(),
  matchingAnalysisVersionContextSchema
    .extend({
      failureReason: z.null(),
      generatedAt: dateTimeSchema,
      result: matchingAnalysisResultSchema,
      status: z.literal("current"),
    })
    .strict(),
  matchingAnalysisVersionContextSchema
    .extend({
      failureReason: z.null(),
      generatedAt: dateTimeSchema,
      result: matchingAnalysisResultSchema,
      status: z.literal("stale"),
    })
    .strict(),
  matchingAnalysisVersionContextSchema
    .extend({
      failureReason: requiredTextSchema,
      generatedAt: z.null(),
      result: z.null(),
      status: z.literal("failed"),
    })
    .strict(),
])

const targetRoleSchema = z
  .object({
    company: nullableTextSchema,
    createdAt: dateTimeSchema,
    experienceRange: experienceRangeSchema.nullable(),
    id: uuidSchema,
    jobDescription: jobDescriptionSchema,
    jobDescriptionAnalysis: jobDescriptionAnalysisSchema.nullable(),
    location: nullableTextSchema,
    matchingAnalysis: matchingAnalysisSchema.nullable(),
    preparationStatus: z.enum(["preparing", "paused", "archived"]),
    recruitmentType: z.enum(["campus", "experienced"]).nullable(),
    title: requiredTextSchema,
    updatedAt: dateTimeSchema,
    version: versionSchema,
  })
  // The dependent ready/non-ready fields are enforced by the refinement below.
  .strict()
  .superRefine((role, context) => {
    if (role.jobDescription.status === "ready") {
      if (role.jobDescriptionAnalysis === null) {
        context.addIssue({
          code: "custom",
          message: "ready job description requires analysis",
          path: ["jobDescriptionAnalysis"],
        })
      } else if (
        role.jobDescription.version !== role.jobDescriptionAnalysis.jobDescriptionVersion
      ) {
        context.addIssue({
          code: "custom",
          message: "ready job description and analysis versions must match",
          path: ["jobDescriptionAnalysis", "jobDescriptionVersion"],
        })
      }
    } else if (role.jobDescriptionAnalysis !== null) {
      context.addIssue({
        code: "custom",
        message: "non-ready job description cannot include analysis",
        path: ["jobDescriptionAnalysis"],
      })
    }

    const matching = role.matchingAnalysis
    if (matching?.status !== "current") return

    if (role.jobDescription.status !== "ready") {
      context.addIssue({
        code: "custom",
        message: "current matching analysis requires ready job description",
        path: ["matchingAnalysis"],
      })
      return
    }
    if (role.jobDescriptionAnalysis === null) {
      context.addIssue({
        code: "custom",
        message: "current matching analysis requires job description analysis",
        path: ["matchingAnalysis"],
      })
      return
    }
    if (matching.jobDescriptionVersion !== role.jobDescription.version) {
      context.addIssue({
        code: "custom",
        message: "current matching analysis and job description versions must match",
        path: ["matchingAnalysis", "jobDescriptionVersion"],
      })
    }
    if (matching.jobDescriptionAnalysisVersion !== role.jobDescriptionAnalysis.analysisVersion) {
      context.addIssue({
        code: "custom",
        message: "current matching analysis and job description analysis versions must match",
        path: ["matchingAnalysis", "jobDescriptionAnalysisVersion"],
      })
    }
  }) as z.ZodType<TargetRoleApiDto>

const profileContextSchema: z.ZodType<ProfileContext> = z.discriminatedUnion("exists", [
  z
    .object({
      completed: z.literal(false),
      exists: z.literal(false),
      version: z.null(),
    })
    .strict(),
  z
    .object({
      completed: z.boolean(),
      exists: z.literal(true),
      version: versionSchema,
    })
    .strict(),
])

export const targetRoleResponseSchema: z.ZodType<TargetRoleApiDto> = targetRoleSchema

export const rolesPageResponseSchema: z.ZodType<RolesPageResponseDto> = z
  .object({
    currentRoleId: uuidSchema.nullable(),
    profileContext: profileContextSchema,
    roles: z.array(targetRoleResponseSchema),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.currentRoleId !== null) {
      const currentRole = response.roles.find((role) => role.id === response.currentRoleId)
      if (!currentRole || currentRole.preparationStatus === "archived") {
        context.addIssue({
          code: "custom",
          message: "currentRoleId must reference an unarchived role.",
          path: ["currentRoleId"],
        })
      }
    }

    for (const role of response.roles) {
      const matching = role.matchingAnalysis
      if (matching?.status !== "current") continue
      if (!response.profileContext.exists) {
        context.addIssue({
          code: "custom",
          message: "current matching analysis requires existing profile context",
          path: ["roles"],
        })
      } else if (matching.profileVersion !== response.profileContext.version) {
        context.addIssue({
          code: "custom",
          message: "current matching analysis and profile context versions must match",
          path: ["roles"],
        })
      }
    }
  })
