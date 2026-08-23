import { z } from "zod"

import { env } from "@/app/env"
import * as jobDescriptionImportMockService from "@/mocks/services/job-description-import"
import { apiRequest } from "@/services/api"

const jobDescriptionImportDraftSchema = z
  .object({
    appliedRoleId: z.uuid().nullable(),
    canApply: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
    parsedCompany: z.string().max(255).nullable(),
    parsedDescription: z.string().trim().min(1).max(50_000).nullable(),
    parsedLocation: z.string().max(255).nullable(),
    parsedTitle: z.string().trim().min(1).max(255).nullable(),
    rawText: z.string().trim().min(1).max(50_000),
    status: z.enum(["ready", "applied"]),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export type JobDescriptionImportDraft = z.infer<typeof jobDescriptionImportDraftSchema>

export type CreateJobDescriptionImportDraftInput = {
  rawText: string
}

function parseDraft(value: unknown): JobDescriptionImportDraft {
  return jobDescriptionImportDraftSchema.parse(value)
}

export async function createJobDescriptionImportDraft(
  input: CreateJobDescriptionImportDraftInput,
): Promise<JobDescriptionImportDraft> {
  const response = env.mock
    ? await jobDescriptionImportMockService.createJobDescriptionImportDraft(input)
    : await apiRequest<unknown>("/job-description-import-drafts", {
        json: input,
        method: "POST",
      })
  return parseDraft(response)
}

export async function getJobDescriptionImportDraft(
  draftId: string,
): Promise<JobDescriptionImportDraft> {
  const response = env.mock
    ? await jobDescriptionImportMockService.getJobDescriptionImportDraft(draftId)
    : await apiRequest<unknown>(`/job-description-import-drafts/${encodeURIComponent(draftId)}`)
  return parseDraft(response)
}

export async function applyJobDescriptionImportDraft(
  draftId: string,
): Promise<JobDescriptionImportDraft> {
  const response = env.mock
    ? await jobDescriptionImportMockService.applyJobDescriptionImportDraft(draftId)
    : await apiRequest<unknown>(
        `/job-description-import-drafts/${encodeURIComponent(draftId)}/apply`,
        { method: "POST" },
      )
  return parseDraft(response)
}
