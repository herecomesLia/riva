import { z } from "zod"

import type { EmploymentType } from "@/api/generated/models"
import { normalizeBulletItems, normalizeTechnologyStack } from "@/models/profile-text"

export const profileEmploymentTypes = [
  "full-time",
  "part-time",
  "internship",
  "contract",
  "freelance",
] as const satisfies readonly EmploymentType[]
const requiredText = z.string().trim().min(1, "required")
export const profileOptionalTextSchema = z.string()
const optionalText = profileOptionalTextSchema
const bulletItemSchema = z.string().trim().min(1, "required")
const bulletItemsSchema = z
  .array(z.string())
  .default([])
  .transform(normalizeBulletItems)
  .pipe(z.array(bulletItemSchema))
const skillsSchema = z
  .array(z.string())
  .default([])
  .transform(normalizeTechnologyStack)
  .pipe(z.array(requiredText))
const technologyStackSchema = z
  .array(z.string())
  .default([])
  .transform(normalizeTechnologyStack)
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
  clientId: requiredText,
  degree: optionalText,
  major: optionalText,
  school: requiredText,
})

export const workItemSchema = dateRangeSchema.extend({
  achievements: bulletItemsSchema,
  clientId: requiredText,
  company: requiredText,
  employmentType: z.union([z.enum(profileEmploymentTypes), z.literal("")]),
  location: optionalText,
  responsibilities: bulletItemsSchema,
  skills: skillsSchema,
  title: requiredText,
})

export const projectItemSchema = dateRangeSchema.extend({
  achievements: bulletItemsSchema,
  clientId: requiredText,
  description: bulletItemsSchema,
  name: requiredText,
  role: optionalText,
  techStack: technologyStackSchema,
  url: optionalText.refine((value) => !value || URL.canParse(value), "url"),
})

export const skillSchema = z.object({
  clientId: requiredText,
  name: requiredText,
})
