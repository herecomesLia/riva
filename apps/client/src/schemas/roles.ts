import { z } from "zod"

import type { RolesPageResponseDto, TargetRoleApiDto } from "@/models/roles"

const uuidSchema = z.uuid()
const versionSchema = z.number().int().positive()

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
      rawText: z.string().trim().min(1),
      status: z.literal("saved"),
      version: versionSchema,
    })
    .strict(),
])

const targetRoleSchema: z.ZodType<TargetRoleApiDto> = z
  .object({
    company: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    experienceRange: experienceRangeSchema.nullable(),
    id: uuidSchema,
    jobDescription: jobDescriptionSchema,
    jobDescriptionAnalysis: z.null(),
    location: z.string().nullable(),
    matchingAnalysis: z.null(),
    preparationStatus: z.enum(["preparing", "paused", "archived"]),
    recruitmentType: z.enum(["campus", "experienced"]).nullable(),
    title: z.string().trim().min(1),
    updatedAt: z.iso.datetime({ offset: true }),
    version: versionSchema,
  })
  .strict()

const profileContextSchema = z.discriminatedUnion("exists", [
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

export const rolesPageResponseSchema: z.ZodType<RolesPageResponseDto> = z
  .object({
    currentRoleId: uuidSchema.nullable(),
    profileContext: profileContextSchema,
    roles: z.array(targetRoleSchema),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.currentRoleId === null) return

    const currentRole = response.roles.find((role) => role.id === response.currentRoleId)
    if (!currentRole || currentRole.preparationStatus === "archived") {
      context.addIssue({
        code: "custom",
        message: "currentRoleId must reference an unarchived role.",
        path: ["currentRoleId"],
      })
    }
  })
