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
const careerProfileNullableTextSchema = z.string().nullable()

const careerProfileEducationResponseSchema: z.ZodType<CareerProfileEducationDto> = z
  .object({
    degree: careerProfileNullableTextSchema,
    endDate: careerProfileMonthSchema.nullable(),
    id: careerProfileUuidSchema,
    isCurrent: z.boolean(),
    major: careerProfileNullableTextSchema,
    school: z.string(),
    source: careerProfileSourceSchema,
    startDate: careerProfileMonthSchema,
  })
  .strict()

const careerProfileWorkExperienceResponseSchema: z.ZodType<CareerProfileWorkExperienceDto> = z
  .object({
    achievements: z.array(z.string()),
    company: z.string(),
    employmentType: z.enum(profileEmploymentTypes),
    endDate: careerProfileMonthSchema.nullable(),
    id: careerProfileUuidSchema,
    isCurrent: z.boolean(),
    location: careerProfileNullableTextSchema,
    responsibilities: z.array(z.string()),
    skillIds: z.array(careerProfileUuidSchema),
    source: careerProfileSourceSchema,
    startDate: careerProfileMonthSchema,
    title: z.string(),
  })
  .strict()

const careerProfileProjectExperienceResponseSchema: z.ZodType<CareerProfileProjectExperienceDto> = z
  .object({
    achievements: z.array(z.string()),
    endDate: careerProfileMonthSchema.nullable(),
    id: careerProfileUuidSchema,
    name: z.string(),
    projectUrl: z.url().nullable(),
    responsibilities: z.array(z.string()),
    role: careerProfileNullableTextSchema,
    skillIds: z.array(careerProfileUuidSchema),
    source: careerProfileSourceSchema,
    startDate: careerProfileMonthSchema,
  })
  .strict()

const careerProfileSkillResponseSchema: z.ZodType<CareerProfileSkillDto> = z
  .object({
    id: careerProfileUuidSchema,
    name: z.string(),
    source: careerProfileSourceSchema,
  })
  .strict()

const careerProfileResponseSchema: z.ZodType<CareerProfileDto> = z
  .object({
    education: z.array(careerProfileEducationResponseSchema),
    profileId: careerProfileUuidSchema,
    projectExperiences: z.array(careerProfileProjectExperienceResponseSchema),
    skills: z.array(careerProfileSkillResponseSchema),
    summary: careerProfileNullableTextSchema,
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
