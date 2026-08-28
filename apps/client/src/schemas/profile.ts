import { z } from "zod"

import {
  normalizeBulletItems,
  normalizeSkillIds,
  normalizeTechnologyStack,
} from "@/models/profile-text"

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
  technologyStack: technologyStackSchema,
})

export const skillSchema = z.object({
  id: requiredText,
  name: requiredText,
})
