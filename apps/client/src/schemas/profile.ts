import { z } from "zod"

import { normalizeBulletItems, normalizeSkillIds } from "@/models/profile-text"
import type {
  CareerProfileDto,
  CareerProfileEducationDto,
  CareerProfileGetResponseDto,
  CareerProfileProjectExperienceDto,
  CareerProfilePutResponseDto,
  CareerProfileSkillDto,
  CareerProfileWorkExperienceDto,
  ResumeDocument,
  ResumeDocumentsResponseDto,
  ResumeImportApplication,
  ResumeImportDraft,
} from "@/models/profile"

export const profileEmploymentTypes = [
  "fullTime",
  "partTime",
  "internship",
  "contract",
  "freelance",
] as const
const requiredText = z.string().trim().min(1, "required")
export const profileOptionalTextSchema = z.string()
const optionalText = profileOptionalTextSchema
const bulletItemSchema = z.string().trim().min(1, "required")
const bulletItemsSchema = z
  .array(z.string())
  .default([])
  .transform(normalizeBulletItems)
  .pipe(z.array(bulletItemSchema))
const skillIdsSchema = z
  .array(z.string())
  .default([])
  .transform(normalizeSkillIds)
  .pipe(z.array(requiredText))

const dateRangeSchema = z
  .object({
    endDate: optionalText,
    isCurrent: z.boolean(),
    startDate: requiredText,
  })
  .superRefine((value, context) => {
    if (!value.isCurrent && !value.endDate) {
      context.addIssue({ code: "custom", message: "required", path: ["endDate"] })
    }
    if (!value.isCurrent && value.endDate && value.endDate < value.startDate) {
      context.addIssue({ code: "custom", message: "dateRange", path: ["endDate"] })
    }
  })

export const educationItemSchema = dateRangeSchema.extend({
  degree: optionalText,
  id: requiredText,
  major: optionalText,
  school: requiredText,
})

export const workItemSchema = dateRangeSchema.extend({
  achievements: bulletItemsSchema,
  company: requiredText,
  employmentType: z.enum(profileEmploymentTypes, "employmentType"),
  id: requiredText,
  location: optionalText,
  responsibilities: bulletItemsSchema,
  skillIds: skillIdsSchema,
  title: requiredText,
})

export const projectItemSchema = dateRangeSchema.extend({
  achievements: bulletItemsSchema,
  id: requiredText,
  name: requiredText,
  projectUrl: optionalText.refine((value) => !value || URL.canParse(value), "url"),
  responsibilities: bulletItemsSchema,
  role: optionalText,
  skillIds: skillIdsSchema,
})

export const skillSchema = z.object({
  id: requiredText,
  name: requiredText,
})

export const credentialsSchema = z.object({
  items: z
    .array(
      z
        .object({
          awardedAt: optionalText,
          credentialId: optionalText,
          credentialUrl: optionalText.refine((value) => !value || URL.canParse(value), "url"),
          description: optionalText,
          expiresAt: optionalText,
          id: requiredText,
          issuer: optionalText,
          name: requiredText,
          type: z.enum(["certificate", "award"]),
        })
        .superRefine((value, context) => {
          if (value.awardedAt && value.expiresAt && value.expiresAt < value.awardedAt) {
            context.addIssue({ code: "custom", message: "dateRange", path: ["expiresAt"] })
          }
        }),
    )
    .default([]),
})

const careerProfileSourceSchema = z.enum(["resumeExtracted", "userEdited", "userAdded"])
const careerProfileUuidSchema = z.uuid()
const careerProfileMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const careerProfileRequiredTextSchema = z.string().trim().min(1).max(255)
const careerProfileNullableTextSchema = z.string().max(255).nullable()
const careerProfileSummarySchema = z.string().max(2000).nullable()
const careerProfileBulletSchema = z.string().trim().min(1).max(1000)

const careerProfileEducationInputSchema = z
  .object({
    degree: careerProfileNullableTextSchema,
    endDate: careerProfileMonthSchema.nullable(),
    id: careerProfileUuidSchema,
    isCurrent: z.boolean(),
    major: careerProfileNullableTextSchema,
    school: careerProfileRequiredTextSchema,
    startDate: careerProfileMonthSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.isCurrent && value.endDate !== null) {
      context.addIssue({ code: "custom", message: "current entries cannot have an end date" })
    }
    if (!value.isCurrent && value.endDate === null) {
      context.addIssue({ code: "custom", message: "non-current entries require an end date" })
    }
    if (value.endDate !== null && value.endDate < value.startDate) {
      context.addIssue({ code: "custom", message: "end date cannot be before start date" })
    }
  })

const careerProfileEducationResponseSchema: z.ZodType<CareerProfileEducationDto> =
  careerProfileEducationInputSchema.safeExtend({ source: careerProfileSourceSchema })

const careerProfileWorkExperienceInputSchema = z
  .object({
    achievements: z.array(careerProfileBulletSchema).max(100),
    company: careerProfileRequiredTextSchema,
    employmentType: z.enum(profileEmploymentTypes),
    endDate: careerProfileMonthSchema.nullable(),
    id: careerProfileUuidSchema,
    isCurrent: z.boolean(),
    location: careerProfileNullableTextSchema,
    responsibilities: z.array(careerProfileBulletSchema).max(100),
    skillIds: z.array(careerProfileUuidSchema).max(100),
    startDate: careerProfileMonthSchema,
    title: careerProfileRequiredTextSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.isCurrent && value.endDate !== null) {
      context.addIssue({ code: "custom", message: "current entries cannot have an end date" })
    }
    if (!value.isCurrent && value.endDate === null) {
      context.addIssue({ code: "custom", message: "non-current entries require an end date" })
    }
    if (value.endDate !== null && value.endDate < value.startDate) {
      context.addIssue({ code: "custom", message: "end date cannot be before start date" })
    }
  })

const careerProfileWorkExperienceResponseSchema: z.ZodType<CareerProfileWorkExperienceDto> =
  careerProfileWorkExperienceInputSchema.safeExtend({ source: careerProfileSourceSchema })

const careerProfileProjectExperienceInputSchema = z
  .object({
    achievements: z.array(careerProfileBulletSchema).max(100),
    endDate: careerProfileMonthSchema.nullable(),
    id: careerProfileUuidSchema,
    name: careerProfileRequiredTextSchema,
    projectUrl: z.url().nullable(),
    responsibilities: z.array(careerProfileBulletSchema).max(100),
    role: careerProfileNullableTextSchema,
    skillIds: z.array(careerProfileUuidSchema).max(100),
    startDate: careerProfileMonthSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endDate !== null && value.endDate < value.startDate) {
      context.addIssue({ code: "custom", message: "end date cannot be before start date" })
    }
  })

const careerProfileProjectExperienceResponseSchema: z.ZodType<CareerProfileProjectExperienceDto> =
  careerProfileProjectExperienceInputSchema.safeExtend({ source: careerProfileSourceSchema })

const careerProfileSkillInputSchema = z
  .object({
    id: careerProfileUuidSchema,
    name: careerProfileRequiredTextSchema,
  })
  .strict()

const careerProfileSkillResponseSchema: z.ZodType<CareerProfileSkillDto> =
  careerProfileSkillInputSchema.extend({ source: careerProfileSourceSchema })

const careerProfileResponseSchema: z.ZodType<CareerProfileDto> = z
  .object({
    education: z.array(careerProfileEducationResponseSchema),
    profileId: careerProfileUuidSchema,
    projectExperiences: z.array(careerProfileProjectExperienceResponseSchema),
    skills: z.array(careerProfileSkillResponseSchema),
    summary: careerProfileSummarySchema,
    updatedAt: z.iso.datetime({ offset: true }),
    version: z.number().int().positive(),
    workExperiences: z.array(careerProfileWorkExperienceResponseSchema),
  })
  .strict()

export const careerProfileGetResponseSchema: z.ZodType<CareerProfileGetResponseDto> = z
  .object({
    profile: careerProfileResponseSchema.nullable(),
  })
  .strict()

export const careerProfilePutResponseSchema: z.ZodType<CareerProfilePutResponseDto> = z
  .object({
    profile: careerProfileResponseSchema,
  })
  .strict()

const resumeDateTimeSchema = z.iso.datetime({ offset: true })
const resumeUuidSchema = z.uuid()

const pendingResumeDocumentSchema = z
  .object({
    byteSize: z.number().int().positive(),
    extractedAt: z.null(),
    extractionStatus: z.literal("pending"),
    failureReason: z.null(),
    id: resumeUuidSchema,
    mediaType: z.string().min(1).max(127),
    originalFilename: z.string().max(255).nullable(),
    sourceType: z.enum(["file", "pastedText"]),
    uploadedAt: resumeDateTimeSchema,
  })
  .strict()

const succeededResumeDocumentSchema = z
  .object({
    byteSize: z.number().int().positive(),
    extractedAt: resumeDateTimeSchema,
    extractionStatus: z.literal("succeeded"),
    failureReason: z.null(),
    id: resumeUuidSchema,
    mediaType: z.string().min(1).max(127),
    originalFilename: z.string().max(255).nullable(),
    sourceType: z.enum(["file", "pastedText"]),
    uploadedAt: resumeDateTimeSchema,
  })
  .strict()

const failedResumeDocumentSchema = z
  .object({
    byteSize: z.number().int().positive(),
    extractedAt: resumeDateTimeSchema,
    extractionStatus: z.literal("failed"),
    failureReason: z.string().trim().min(1).max(255),
    id: resumeUuidSchema,
    mediaType: z.string().min(1).max(127),
    originalFilename: z.string().max(255).nullable(),
    sourceType: z.enum(["file", "pastedText"]),
    uploadedAt: resumeDateTimeSchema,
  })
  .strict()

export const resumeDocumentSchema: z.ZodType<ResumeDocument> = z.discriminatedUnion(
  "extractionStatus",
  [pendingResumeDocumentSchema, succeededResumeDocumentSchema, failedResumeDocumentSchema],
)

export const resumeDocumentsResponseSchema: z.ZodType<ResumeDocumentsResponseDto> = z
  .object({
    documents: z.array(resumeDocumentSchema),
  })
  .strict()

const resumeImportDraftStatusSchema = z.enum(["ready", "applied", "superseded"])

const resumeImportSectionSchema = z.enum([
  "education",
  "workExperience",
  "projectExperience",
  "skills",
  "summary",
])
const resumeImportSkipReasonSchema = z.enum([
  "start_date_missing",
  "start_date_precision_insufficient",
  "end_date_missing",
  "end_date_precision_insufficient",
  "current_status_unknown",
  "employment_type_unknown",
  "profile_schema_invalid",
])
const resumeImportProtectedSourceSchema = z.enum(["userEdited", "userAdded"])
const resumeImportSummaryActionSchema = z.enum(["set", "preserve", "none"])
const resumeImportSkippedItemSchema = z
  .object({
    reasons: z.array(resumeImportSkipReasonSchema).min(1),
    section: resumeImportSectionSchema,
    sourceIndex: z.number().int().nonnegative(),
  })
  .strict()
const resumeImportProtectedItemSchema = z
  .object({
    itemId: resumeUuidSchema,
    section: resumeImportSectionSchema,
    source: resumeImportProtectedSourceSchema,
  })
  .strict()
const resumeImportChangeSummarySchema = z
  .object({
    changedItems: z.number().int().nonnegative(),
    missingItems: z.number().int().nonnegative(),
    newItems: z.number().int().nonnegative(),
  })
  .strict()
const resumeImportSummarySchema = z
  .string()
  .max(2000)
  .refine((value) => value.trim().length > 0, "summary must not be blank")
  .nullable()
const resumeImportUnresolvedItemsSchema = z
  .array(
    z
      .string()
      .max(1000)
      .refine((value) => value.trim().length > 0, "unresolved item must not be blank"),
  )
  .max(100)

export const resumeImportDraftSchema: z.ZodType<ResumeImportDraft> = z
  .object({
    appliedAt: resumeDateTimeSchema.nullable(),
    appliedProfileVersion: z.number().int().positive().nullable(),
    baseProfileId: resumeUuidSchema.nullable(),
    baseProfileVersion: z.number().int().positive().nullable(),
    canApply: z.boolean(),
    changeSummary: resumeImportChangeSummarySchema,
    createdAt: resumeDateTimeSchema,
    draftVersion: z.number().int().positive(),
    education: z.array(careerProfileEducationInputSchema).max(100),
    projectExperiences: z.array(careerProfileProjectExperienceInputSchema).max(100),
    parsingResultVersion: z.number().int().positive(),
    protectedItems: z.array(resumeImportProtectedItemSchema),
    resumeDocumentId: resumeUuidSchema,
    skippedItems: z.array(resumeImportSkippedItemSchema),
    skills: z.array(careerProfileSkillInputSchema).max(200),
    status: resumeImportDraftStatusSchema,
    summary: resumeImportSummarySchema,
    summaryAction: resumeImportSummaryActionSchema,
    unresolvedItems: resumeImportUnresolvedItemsSchema,
    updatedAt: resumeDateTimeSchema,
    workExperiences: z.array(careerProfileWorkExperienceInputSchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.baseProfileId === null) !== (value.baseProfileVersion === null)) {
      context.addIssue({ code: "custom", message: "base profile fields must be provided together" })
    }

    if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
      context.addIssue({ code: "custom", message: "updatedAt cannot be before createdAt" })
    }

    if (value.summaryAction === "set" && (value.summary === null || !value.summary.trim())) {
      context.addIssue({ code: "custom", message: "set drafts require a summary" })
    }
    if (value.summaryAction === "preserve" && value.summary === null) {
      context.addIssue({ code: "custom", message: "preserve drafts require a summary" })
    }
    if (value.summaryAction === "none" && value.summary !== null) {
      context.addIssue({ code: "custom", message: "none drafts cannot contain a summary" })
    }

    if (
      value.status === "ready" &&
      (!value.canApply || value.appliedProfileVersion !== null || value.appliedAt !== null)
    ) {
      context.addIssue({ code: "custom", message: "ready draft state is invalid" })
    }
    if (
      value.status === "applied" &&
      (value.canApply || value.appliedProfileVersion === null || value.appliedAt === null)
    ) {
      context.addIssue({ code: "custom", message: "applied draft state is invalid" })
    }
    if (
      value.status === "superseded" &&
      (value.canApply || value.appliedProfileVersion !== null || value.appliedAt !== null)
    ) {
      context.addIssue({ code: "custom", message: "superseded draft state is invalid" })
    }

    const sectionIds = [
      value.education,
      value.workExperiences,
      value.projectExperiences,
      value.skills,
    ]
    for (const section of sectionIds) {
      const ids = section.map((item) => item.id)
      if (ids.length !== new Set(ids).size) {
        context.addIssue({
          code: "custom",
          message: "draft item ids must be unique within each section",
        })
      }
    }

    const skillIds = new Set(value.skills.map((skill) => skill.id))
    const experiences = [...value.workExperiences, ...value.projectExperiences]
    if (experiences.some((experience) => experience.skillIds.some((id) => !skillIds.has(id)))) {
      context.addIssue({
        code: "custom",
        message: "draft experience skillIds must reference draft skills",
      })
    }

    const skillNames = value.skills.map((skill) => skill.name.trim().toLowerCase())
    if (skillNames.length !== new Set(skillNames).size) {
      context.addIssue({ code: "custom", message: "draft skill names must be unique" })
    }

    const protectedKeys = value.protectedItems.map((item) => `${item.section}:${item.itemId}`)
    if (protectedKeys.length !== new Set(protectedKeys).size) {
      context.addIssue({ code: "custom", message: "draft protected items must be unique" })
    }

    const skippedKeys = value.skippedItems.map((item) => `${item.section}:${item.sourceIndex}`)
    if (skippedKeys.length !== new Set(skippedKeys).size) {
      context.addIssue({ code: "custom", message: "draft skipped items must be unique" })
    }
  })

export const resumeImportApplicationSchema: z.ZodType<ResumeImportApplication> = z
  .object({
    draft: resumeImportDraftSchema,
    profile: careerProfileResponseSchema,
    profileChanged: z.boolean(),
    profileCreated: z.boolean(),
  })
  .strict()
