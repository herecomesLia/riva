import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetProfileMockState } from "@/mocks/services/profile"
import { resumeImportDraftSchema } from "@/schemas/profile"
import {
  applyResumeImportDraft,
  getJobProfile,
  getResumeImportDraft,
  getResumeParsingStatus,
  listResumeDocuments,
  retryResumeParsing,
  saveProfileSection,
  startResumeParsing,
  uploadResume,
} from "@/services/profile"

describe("resume profile service in mock mode", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    resetProfileMockState("noProfile")
  })

  afterEach(() => {
    expect(fetchMock).not.toHaveBeenCalled()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync()
    return promise
  }

  async function uploadAndComplete(input: { file?: File; text?: string } = { text: "Resume" }) {
    const document = await settle(uploadResume(input))
    await settle(startResumeParsing(document.id))
    const parsing = await settle(getResumeParsingStatus(document.id))
    return { document, parsing }
  }

  async function expectConflict<T>(promise: Promise<T>, code: string) {
    const expectation = expect(promise).rejects.toMatchObject({
      body: { error: code },
      code,
      status: 409,
    })
    await vi.runAllTimersAsync()
    await expectation
  }

  it("uploads pasted text without fetch", async () => {
    const document = await settle(uploadResume({ text: "Resume text" }))

    expect(document).toMatchObject({ extractionStatus: "pending", sourceType: "pastedText" })
    expect(document.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("uploads a file without fetch", async () => {
    const file = new File(["Resume"], "resume.pdf", { type: "application/pdf" })
    const document = await settle(uploadResume({ file }))

    expect(document).toMatchObject({
      mediaType: "application/pdf",
      originalFilename: "resume.pdf",
      sourceType: "file",
    })
  })

  it("lists API-native Resume Documents and honors the limit", async () => {
    await expect(settle(listResumeDocuments())).resolves.toEqual([])
    const first = await settle(uploadResume({ text: "Resume A" }))
    const second = await settle(uploadResume({ text: "Resume B" }))

    await expect(settle(listResumeDocuments(1))).resolves.toEqual([second])
    await expect(settle(listResumeDocuments(2))).resolves.toEqual([second, first])
  })

  it("clears uploaded Resume Documents on reset", async () => {
    await settle(uploadResume({ text: "Resume" }))
    resetProfileMockState("noProfile")

    await expect(settle(listResumeDocuments())).resolves.toEqual([])
  })

  it("does not derive API-native Resume Documents from legacy profile.resume", async () => {
    resetProfileMockState("complete")

    expect((await settle(getJobProfile())).profile?.resume).not.toBeNull()
    await expect(settle(listResumeDocuments())).resolves.toEqual([])
  })

  it("starts parsing and keeps an active run idempotent", async () => {
    const document = await settle(uploadResume({ text: "Resume" }))
    const first = await settle(startResumeParsing(document.id))
    const repeated = await settle(startResumeParsing(document.id))

    expect(first.status).toBe("running")
    expect(repeated.runId).toBe(first.runId)
    expect(repeated.attemptCount).toBe(1)
  })

  it("does not change Profile business data when parsing succeeds", async () => {
    resetProfileMockState("complete")
    const before = (await settle(getJobProfile())).profile!
    const { parsing } = await uploadAndComplete()
    const after = (await settle(getJobProfile())).profile!

    expect(parsing).toMatchObject({ draftStatus: "ready", resultVersion: 1, status: "succeeded" })
    expect({
      education: after.education,
      profileId: after.profileId,
      projectExperiences: after.projectExperiences,
      skills: after.skills,
      summary: after.summary,
      version: after.version,
      workExperiences: after.workExperiences,
    }).toEqual({
      education: before.education,
      profileId: before.profileId,
      projectExperiences: before.projectExperiences,
      skills: before.skills,
      summary: before.summary,
      version: before.version,
      workExperiences: before.workExperiences,
    })
  })

  it("returns a ready Draft after parsing succeeds", async () => {
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))

    expect(draft).toMatchObject({
      baseProfileId: null,
      baseProfileVersion: null,
      canApply: true,
      status: "ready",
    })
  })

  it("returns a Draft accepted by the contract schema", async () => {
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))

    expect(resumeImportDraftSchema.parse(draft)).toEqual(draft)
  })

  it("rejects Draft access before parsing succeeds", async () => {
    const document = await settle(uploadResume({ text: "Resume" }))

    await expectConflict(getResumeImportDraft(document.id), "resume_import_draft_not_ready")
  })

  it("creates a Profile on the first explicit apply", async () => {
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const result = await settle(applyResumeImportDraft(document.id, draft.draftVersion))

    expect(result).toMatchObject({ profileChanged: true, profileCreated: true })
    expect(result.profile.version).toBe(1)
    expect(result.draft.status).toBe("applied")
  })

  it("applies candidate content to the created Profile", async () => {
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const result = await settle(applyResumeImportDraft(document.id, draft.draftVersion))

    expect(result.profile.summary).toBe(draft.summary)
    expect(result.profile.education).toHaveLength(draft.education.length)
    expect(result.profile.skills.length).toBeGreaterThan(0)
  })

  it("marks newly imported Profile items as resumeExtracted", async () => {
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const { profile } = await settle(applyResumeImportDraft(document.id, draft.draftVersion))

    const sources = [
      ...profile.education,
      ...profile.workExperiences,
      ...profile.projectExperiences,
      ...profile.skills,
    ].map((item) => item.source)
    expect(new Set(sources)).toEqual(new Set(["resumeExtracted"]))
  })

  it("replays an applied Draft idempotently", async () => {
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const first = await settle(applyResumeImportDraft(document.id, draft.draftVersion))
    const replay = await settle(applyResumeImportDraft(document.id, draft.draftVersion))

    expect(replay).toMatchObject({ profileChanged: false, profileCreated: false })
    expect(replay.profile).toEqual(first.profile)
  })

  it("keeps appliedAt fixed during replay", async () => {
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const first = await settle(applyResumeImportDraft(document.id, draft.draftVersion))
    const replay = await settle(applyResumeImportDraft(document.id, draft.draftVersion))

    expect(replay.draft.appliedAt).toBe(first.draft.appliedAt)
  })

  it("does not increase Profile version or updatedAt during replay", async () => {
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const first = await settle(applyResumeImportDraft(document.id, draft.draftVersion))
    const replay = await settle(applyResumeImportDraft(document.id, draft.draftVersion))

    expect(replay.profile.version).toBe(first.profile.version)
    expect(replay.profile.updatedAt).toBe(first.profile.updatedAt)
  })

  it("rejects applied replay after the Profile changes again", async () => {
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const applied = await settle(applyResumeImportDraft(document.id, draft.draftVersion))
    const snapshot = await settle(getJobProfile())
    const profile = snapshot.profile!
    await settle(
      saveProfileSection({
        profileId: profile.profileId,
        section: "education",
        values: profile.education.map((item, index) =>
          index === 0 ? { ...item, degree: "Edited after apply" } : item,
        ),
        version: profile.version,
      }),
    )

    await expectConflict(
      applyResumeImportDraft(document.id, applied.draft.draftVersion),
      "resume_import_apply_conflict",
    )
  })

  it("protects an existing userEdited item", async () => {
    resetProfileMockState("complete")
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const protectedWork = draft.protectedItems.find((item) => item.section === "workExperience")
    const result = await settle(applyResumeImportDraft(document.id, draft.draftVersion))

    expect(protectedWork?.source).toBe("userEdited")
    expect(
      result.profile.workExperiences.find((item) => item.id === protectedWork?.itemId)?.source,
    ).toBe("userEdited")
  })

  it("protects an existing userAdded skill", async () => {
    resetProfileMockState("complete")
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const protectedSkill = draft.protectedItems.find((item) => item.section === "skills")
    const result = await settle(applyResumeImportDraft(document.id, draft.draftVersion))

    expect(protectedSkill?.source).toBe("userAdded")
    expect(result.profile.skills.find((item) => item.id === protectedSkill?.itemId)?.source).toBe(
      "userAdded",
    )
  })

  it("updates an existing resumeExtracted item", async () => {
    resetProfileMockState("complete")
    const before = (await settle(getJobProfile())).profile!.workExperiences[1]
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const result = await settle(applyResumeImportDraft(document.id, draft.draftVersion))
    const updated = result.profile.workExperiences.find(
      (item) => item.source === "resumeExtracted",
    )!

    expect(updated.title).not.toBe(before.title)
    expect(updated.source).toBe("resumeExtracted")
  })

  it("retains a resumeExtracted item missing from the new Resume", async () => {
    resetProfileMockState("complete")
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const result = await settle(applyResumeImportDraft(document.id, draft.draftVersion))

    expect(draft.changeSummary.missingItems).toBeGreaterThan(0)
    expect(result.profile.education).toHaveLength(2)
  })

  it("rejects stale Draft apply after a manual Profile edit", async () => {
    resetProfileMockState("complete")
    const { document } = await uploadAndComplete()
    const draft = await settle(getResumeImportDraft(document.id))
    const snapshot = await settle(getJobProfile())
    const profile = snapshot.profile!
    await settle(
      saveProfileSection({
        profileId: profile.profileId,
        section: "education",
        values: profile.education.map((item, index) =>
          index === 0 ? { ...item, degree: "Manually edited degree" } : item,
        ),
        version: profile.version,
      }),
    )

    await expectConflict(
      applyResumeImportDraft(document.id, draft.draftVersion),
      "resume_import_profile_version_conflict",
    )
  })

  it("rebuilds Draft with a new version after a manual Profile edit", async () => {
    resetProfileMockState("complete")
    const { document } = await uploadAndComplete()
    const first = await settle(getResumeImportDraft(document.id))
    const profile = (await settle(getJobProfile())).profile!
    await settle(
      saveProfileSection({
        profileId: profile.profileId,
        section: "education",
        values: profile.education.map((item, index) =>
          index === 0 ? { ...item, degree: "Manually edited degree" } : item,
        ),
        version: profile.version,
      }),
    )
    const rebuilt = await settle(getResumeImportDraft(document.id))

    expect(rebuilt.draftVersion).toBe(first.draftVersion + 1)
    expect(rebuilt.baseProfileVersion).toBe(profile.version + 1)
  })

  it("applies a rebuilt Draft", async () => {
    resetProfileMockState("complete")
    const { document } = await uploadAndComplete()
    await settle(getResumeImportDraft(document.id))
    const profile = (await settle(getJobProfile())).profile!
    await settle(
      saveProfileSection({
        profileId: profile.profileId,
        section: "education",
        values: profile.education.map((item, index) =>
          index === 0 ? { ...item, degree: "Manually edited degree" } : item,
        ),
        version: profile.version,
      }),
    )
    const rebuilt = await settle(getResumeImportDraft(document.id))
    const result = await settle(applyResumeImportDraft(document.id, rebuilt.draftVersion))

    expect(result.draft.status).toBe("applied")
    expect(result.profile.education[0].degree).toBe("Manually edited degree")
  })

  it("retries a failed parsing run with a new runId", async () => {
    const document = await settle(uploadResume({ text: "retryable resume" }))
    const started = await settle(startResumeParsing(document.id))
    const failed = await settle(getResumeParsingStatus(document.id))
    const retried = await settle(retryResumeParsing(document.id))

    expect(failed.status).toBe("failed")
    expect(retried.status).toBe("running")
    expect(retried.runId).not.toBe(started.runId)
    expect(retried.attemptCount).toBe(1)
  })

  it("requires retry instead of ordinary start after failure", async () => {
    const document = await settle(uploadResume({ text: "retryable resume" }))
    await settle(startResumeParsing(document.id))
    await settle(getResumeParsingStatus(document.id))

    await expectConflict(startResumeParsing(document.id), "resume_parsing_retry_required")
  })

  it("rejects retry after parsing succeeds", async () => {
    const { document } = await uploadAndComplete()

    await expectConflict(retryResumeParsing(document.id), "resume_parsing_retry_not_allowed")
  })

  it("supersedes another ready Draft after a changing apply", async () => {
    const first = await uploadAndComplete({ text: "Resume A" })
    const second = await uploadAndComplete({ text: "Resume B" })
    const draftA = await settle(getResumeImportDraft(first.document.id))
    await settle(getResumeImportDraft(second.document.id))
    await settle(applyResumeImportDraft(first.document.id, draftA.draftVersion))
    const parsingB = await settle(getResumeParsingStatus(second.document.id))

    expect(parsingB.draftStatus).toBe("superseded")
  })

  it("rebuilds a superseded Draft and rejects its old version", async () => {
    const first = await uploadAndComplete({ text: "Resume A" })
    const second = await uploadAndComplete({ text: "Resume B" })
    const draftA = await settle(getResumeImportDraft(first.document.id))
    const oldDraftB = await settle(getResumeImportDraft(second.document.id))
    await settle(applyResumeImportDraft(first.document.id, draftA.draftVersion))
    const rebuiltB = await settle(getResumeImportDraft(second.document.id))

    expect(rebuiltB).toMatchObject({ canApply: true, status: "ready" })
    expect(rebuiltB.draftVersion).toBe(oldDraftB.draftVersion + 1)
    await expectConflict(
      applyResumeImportDraft(second.document.id, oldDraftB.draftVersion),
      "resume_import_draft_version_conflict",
    )
  })

  it("clears all API-native Resume state on reset", async () => {
    const document = await settle(uploadResume({ text: "Resume" }))
    resetProfileMockState("noProfile")

    const expectation = expect(startResumeParsing(document.id)).rejects.toMatchObject({
      body: { error: "resume_document_not_found" },
      code: "resume_document_not_found",
      status: 404,
    })
    await vi.runAllTimersAsync()
    await expectation
  })

  it("rejects retry before parsing has started", async () => {
    const document = await settle(uploadResume({ text: "Resume" }))

    await expectConflict(retryResumeParsing(document.id), "resume_parsing_not_started")
  })
})
