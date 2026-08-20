import { createElement } from "react"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { createProfileMockSnapshot } from "@/mocks/data/profile"
import type {
  ResumeDocument,
  ResumeImportApplication,
  ResumeImportDraft,
  ResumeParsingStatus,
} from "@/models/profile"
import { ProfilePage } from "@/pages/profile"
import * as profileService from "@/services/profile"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/profile")>()),
  applyResumeImportDraft: vi.fn(),
  getJobProfile: vi.fn(),
  getResumeImportDraft: vi.fn(),
  getResumeParsingStatus: vi.fn(),
  listResumeDocuments: vi.fn(),
  startResumeParsing: vi.fn(),
  uploadResume: vi.fn(),
}))

const resumeId = "11111111-1111-4111-8111-111111111111"
const runId = "22222222-2222-4222-8222-222222222222"
const timestamp = "2026-08-20T12:00:00Z"

const document: ResumeDocument = {
  byteSize: 11,
  extractedAt: null,
  extractionStatus: "pending",
  failureReason: null,
  id: resumeId,
  mediaType: "text/plain",
  originalFilename: null,
  sourceType: "pastedText",
  uploadedAt: timestamp,
}

function parsingStatus(status: "running" | "succeeded"): ResumeParsingStatus {
  return {
    attemptCount: 1,
    canRetry: false,
    createdAt: timestamp,
    draftStatus: status === "succeeded" ? "ready" : null,
    draftVersion: status === "succeeded" ? 1 : null,
    errorCode: null,
    failureReason: null,
    finishedAt: status === "succeeded" ? timestamp : null,
    maxAttempts: 3,
    resultVersion: status === "succeeded" ? 1 : null,
    resumeDocumentId: resumeId,
    runId,
    startedAt: timestamp,
    status,
  }
}

function readyDraft(): ResumeImportDraft {
  return {
    appliedAt: null,
    appliedProfileVersion: null,
    baseProfileId: null,
    baseProfileVersion: null,
    canApply: true,
    changeSummary: { changedItems: 0, missingItems: 0, newItems: 1 },
    createdAt: timestamp,
    draftVersion: 1,
    education: [],
    parsingResultVersion: 1,
    projectExperiences: [],
    protectedItems: [],
    resumeDocumentId: resumeId,
    skippedItems: [],
    skills: [{ id: "33333333-3333-4333-8333-333333333333", name: "TypeScript" }],
    sourceRunId: runId,
    status: "ready",
    summary: "Imported resume",
    summaryAction: "set",
    unresolvedItems: [],
    updatedAt: timestamp,
    workExperiences: [],
  }
}

function appliedDraft(): ResumeImportApplication {
  const draft = readyDraft()
  return {
    draft: {
      ...draft,
      appliedAt: timestamp,
      appliedProfileVersion: 1,
      canApply: false,
      status: "applied",
    },
    profile: {
      education: [],
      profileId: "44444444-4444-4444-8444-444444444444",
      projectExperiences: [],
      skills: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "TypeScript",
          source: "resumeExtracted",
        },
      ],
      summary: "Imported resume",
      updatedAt: timestamp,
      version: 1,
      workExperiences: [],
    },
    profileChanged: true,
    profileCreated: true,
  }
}

describe("Profile legacy API cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not export deprecated Profile, Resume, or Matching functions", () => {
    const exportNames = Object.keys(profileService)
    const legacyFunctions = [
      "uploadInitialResume",
      "startInitialResumeRecognition",
      "getInitialResumeRecognitionStatus",
      "uploadUpdatedResume",
      "startUpdatedResumeRecognition",
      "getResumeUpdateStatus",
      "regenerateMatchingAnalysis",
    ]

    for (const name of legacyFunctions) expect(exportNames).not.toContain(name)
  })

  it("keeps the Resume Document and Import Draft APIs", () => {
    expect(profileService.uploadResume).toEqual(expect.any(Function))
    expect(profileService.startResumeParsing).toEqual(expect.any(Function))
    expect(profileService.getResumeParsingStatus).toEqual(expect.any(Function))
    expect(profileService.getResumeImportDraft).toEqual(expect.any(Function))
    expect(profileService.applyResumeImportDraft).toEqual(expect.any(Function))
  })

  it("completes upload, parse, draft review, and apply from ProfilePage", async () => {
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(createProfileMockSnapshot("noProfile"))
      .mockResolvedValueOnce(createProfileMockSnapshot("complete"))
    vi.mocked(profileService.listResumeDocuments).mockResolvedValue([])
    vi.mocked(profileService.uploadResume).mockResolvedValue(document)
    vi.mocked(profileService.startResumeParsing).mockResolvedValue(parsingStatus("running"))
    vi.mocked(profileService.getResumeParsingStatus).mockResolvedValue(parsingStatus("succeeded"))
    vi.mocked(profileService.getResumeImportDraft).mockResolvedValue(readyDraft())
    vi.mocked(profileService.applyResumeImportDraft).mockResolvedValue(appliedDraft())

    renderWithProviders(createElement(ProfilePage), {
      router: { initialEntries: ["/profile"] },
    })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    await waitFor(() =>
      expect(profileService.getResumeParsingStatus).toHaveBeenCalledWith(resumeId),
    )
    expect(profileService.uploadResume).toHaveBeenCalledWith({ text: "resume text" })
    expect(profileService.startResumeParsing).toHaveBeenCalledWith(resumeId)
    expect(profileService.getResumeImportDraft).toHaveBeenCalledWith(resumeId)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.importDraft.apply") }),
    )

    await waitFor(() =>
      expect(profileService.applyResumeImportDraft).toHaveBeenCalledWith(resumeId, 1),
    )
    await waitFor(() => expect(profileService.getJobProfile).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId("profile-resume-draft-review")).not.toBeInTheDocument()
  })
})
