import { z } from "zod"

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
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({ code: "custom", message: "dateRange", path: ["endDate"] })
    }
  })

export const educationItemSchema = dateRangeSchema.extend({
  degree: optionalText,
  description: optionalText,
  id: requiredText,
  major: optionalText,
  school: requiredText,
  reviewStatus: z.any(),
  source: z.any(),
})

export const workItemSchema = dateRangeSchema.extend({
  achievements: optionalText,
  company: requiredText,
  employmentType: z.enum(profileEmploymentTypes, "employmentType"),
  id: requiredText,
  location: optionalText,
  responsibilities: optionalText,
  reviewStatus: z.any(),
  skillIds: optionalText,
  source: z.any(),
  title: requiredText,
})

export const projectItemSchema = dateRangeSchema.extend({
  achievements: optionalText,
  background: optionalText,
  contributions: optionalText,
  id: requiredText,
  name: requiredText,
  projectUrl: optionalText.refine((value) => !value || URL.canParse(value), "url"),
  relatedWorkExperienceId: optionalText,
  responsibilities: optionalText,
  reviewStatus: z.any(),
  role: optionalText,
  source: z.any(),
  technologies: optionalText,
})

export const skillSchema = z.object({
  category: optionalText,
  id: requiredText,
  name: requiredText,
  reviewStatus: z.any(),
  source: z.any(),
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
          reviewStatus: z.any(),
          source: z.any(),
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
