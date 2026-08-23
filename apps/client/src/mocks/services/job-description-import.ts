import { createJobDescriptionImportDraftFixture } from "@/mocks/data/job-description-import"
import * as rolesMockService from "@/mocks/services/roles"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  CreateJobDescriptionImportDraftInput,
  JobDescriptionImportDraft,
} from "@/services/job-description-import"

const drafts = new Map<string, JobDescriptionImportDraft>()

export function resetJobDescriptionImportMockState() {
  drafts.clear()
}

export async function createJobDescriptionImportDraft(
  input: CreateJobDescriptionImportDraftInput,
): Promise<JobDescriptionImportDraft> {
  await waitForMockDelay()
  const normalizedText = input.rawText.trim()
  if (normalizedText.toLowerCase().includes("unparseable")) {
    throw new Error("Job description could not be parsed.")
  }
  const draft = createJobDescriptionImportDraftFixture("ready", { rawText: normalizedText })
  drafts.set(draft.id, draft)
  return structuredClone(draft)
}

export async function getJobDescriptionImportDraft(
  draftId: string,
): Promise<JobDescriptionImportDraft> {
  await waitForMockDelay()
  const draft = requireDraft(draftId)
  return structuredClone(draft)
}

export async function applyJobDescriptionImportDraft(
  draftId: string,
): Promise<JobDescriptionImportDraft> {
  await waitForMockDelay()
  const draft = requireDraft(draftId)
  if (draft.status === "applied") return structuredClone(draft)
  if (draft.status !== "ready" || !draft.parsedTitle) {
    throw new Error("Job description import draft is not ready.")
  }

  const appliedRoleId = rolesMockService.addImportedTargetRole({
    company: draft.parsedCompany,
    location: draft.parsedLocation,
    rawText: draft.rawText,
    title: draft.parsedTitle,
  })
  const appliedDraft: JobDescriptionImportDraft = {
    ...draft,
    appliedRoleId,
    canApply: false,
    status: "applied",
  }
  drafts.set(draft.id, appliedDraft)
  return structuredClone(appliedDraft)
}

function requireDraft(draftId: string): JobDescriptionImportDraft {
  const draft = drafts.get(draftId)
  if (!draft) throw new Error("Job description import draft was not found.")
  return draft
}
