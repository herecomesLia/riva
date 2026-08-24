import { z } from "zod"

import type { ProfileContent, Profile, SaveProfileInput } from "@/models/profile"

export const profileEmploymentTypes = [
  "fullTime",
  "partTime",
  "internship",
  "contract",
  "freelance",
] as const

const dateSchema = z.string().nullable()
const textSchema = z.string()
const optionalTextSchema = z.string().nullable()
const summarySchema = z.string().nullable()
const bulletItemsSchema = z.array(z.string())
const skillSchema = z.string()

const dateFields = z.object({
  endDate: dateSchema,
  isCurrent: z.boolean(),
  startDate: dateSchema,
})

export const educationSchema = dateFields.extend({
  degree: optionalTextSchema,
  major: optionalTextSchema,
  school: textSchema,
})

export const workExperienceSchema = dateFields.extend({
  achievements: bulletItemsSchema,
  company: textSchema,
  employmentType: z.enum(profileEmploymentTypes).nullable(),
  location: optionalTextSchema,
  responsibilities: bulletItemsSchema,
  skills: z.array(skillSchema),
  title: textSchema,
})

export const projectExperienceSchema = dateFields.extend({
  achievements: bulletItemsSchema,
  name: textSchema,
  projectUrl: z.string().nullable(),
  role: optionalTextSchema,
  responsibilities: bulletItemsSchema,
  skills: z.array(skillSchema),
})

export const profileContentSchema: z.ZodType<ProfileContent> = z.object({
  education: z.array(educationSchema),
  projectExperiences: z.array(projectExperienceSchema),
  skills: z.array(skillSchema),
  summary: summarySchema,
  workExperiences: z.array(workExperienceSchema),
})

export const profileResponseSchema: z.ZodType<Profile> = z.object({
  content: profileContentSchema,
  updatedAt: z.string(),
  version: z.number(),
})

export const profileGetResponseSchema = profileResponseSchema.nullable()

export const saveProfileInputSchema: z.ZodType<SaveProfileInput> = z.object({
  content: profileContentSchema,
  version: z.number().nullable(),
})
