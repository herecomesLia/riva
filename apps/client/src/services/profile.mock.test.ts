import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { profileResponseMock } from "@/mocks/data/profile"
import { resetProfileMockState } from "@/mocks/services/profile"
import {
  createManualJobProfile,
  getJobProfile,
  getResumeRecognitionStatus,
  getResumeUpdateStatus,
  resetInitialResumeImport,
  saveProfileSection,
  startInitialResumeRecognition,
  startUpdatedResumeRecognition,
  uploadInitialResume,
  uploadUpdatedResume,
} from "@/services/profile"

describe("profile mock service", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetProfileMockState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function settle<T>(promise: Promise<T>) {
    await vi.runAllTimersAsync()
    return promise
  }

  async function saveProfile(input: Parameters<typeof saveProfileSection>[0]) {
    const snapshot = await settle(saveProfileSection(input))
    if (!snapshot.profile) throw new Error("Saved profile snapshot is invalid.")
    return snapshot.profile
  }

  it("returns the current mock snapshot after the configured mock delay", async () => {
    const promise = getJobProfile()
    let settled = false
    void promise.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toEqual(profileResponseMock)
  })

  it("returns an independent snapshot for every request", async () => {
    const first = await settle(getJobProfile())
    const second = await settle(getJobProfile())
    first.profile!.education[0]!.school = "mutated"
    expect(second).toEqual(profileResponseMock)
    expect(second).not.toBe(first)
    expect(second.profile).not.toBe(first.profile)
  })

  it("saves a typed section without mutating the standard fixture", async () => {
    const values = structuredClone(profileResponseMock.profile!.education)
    values[0]!.school = "Updated University"
    const profile = await saveProfile({
      profileId: profileResponseMock.profile!.profileId,
      version: profileResponseMock.profile!.version,
      section: "education",
      values,
    })
    expect(profile.education[0]!.school).toBe("Updated University")
    expect(profile.education[0]!.source).toBe("userEdited")
    expect(profile.version).toBe(profileResponseMock.profile!.version + 1)
    expect(profileResponseMock.profile!.education[0]!.school).toBe("Fudan University")

    const current = await settle(getJobProfile())
    expect(current.profile!.education[0]!.school).toBe("Updated University")
  })

  it("derives sources from the current profile instead of accepting form metadata", async () => {
    const values = structuredClone(profileResponseMock.profile!.skills)
    values[1]!.name = "TypeScript Advanced"
    values.push({
      id: "draft_new_skill",
      name: "Testing Library",
      source: "resumeExtracted",
    })
    const profile = await saveProfile({
      profileId: profileResponseMock.profile!.profileId,
      version: profileResponseMock.profile!.version,
      section: "skills",
      values,
    })

    expect(profile.skills.find((skill) => skill.id === "skill_react")!.source).toBe(
      "resumeExtracted",
    )
    expect(profile.skills.find((skill) => skill.id === "skill_typescript")!.source).toBe(
      "userEdited",
    )
    expect(profile.skills.find((skill) => skill.id === "draft_new_skill")!.source).toBe("userAdded")
    expect(
      profile.skills.every((skill) => Object.keys(skill).sort().join(",") === "id,name,source"),
    ).toBe(true)
  })

  it("retains the target-role section contract for the future Roles module", async () => {
    const values = structuredClone(profileResponseMock.profile!.targetRoles)
    values[0]!.title = "Principal Frontend Engineer"
    const profile = await saveProfile({
      profileId: profileResponseMock.profile!.profileId,
      version: profileResponseMock.profile!.version,
      section: "targetRoles",
      values,
    })

    expect(profile.targetRoles[0]!.title).toBe("Principal Frontend Engineer")
    expect(profileResponseMock.profile!.targetRoles[0]!.title).toBe("Frontend Technical Lead")
  })

  it("rejects a stale save version with a clear service error", async () => {
    const promise = saveProfileSection({
      profileId: profileResponseMock.profile!.profileId,
      version: -1,
      section: "skills",
      values: [],
    })
    const assertion = expect(promise).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await assertion
  })

  it("atomically creates a new skill and replaces its temporary work-experience id", async () => {
    const values = [structuredClone(profileResponseMock.profile!.workExperiences[0]!)]
    values[0]!.skillIds = ["skill_react", "draft_skill_accessibility"]

    const profile = await saveProfile({
      profileId: profileResponseMock.profile!.profileId,
      section: "workExperience",
      skillsToCreate: [{ clientId: "draft_skill_accessibility", name: "Accessibility" }],
      values,
      version: profileResponseMock.profile!.version,
    })

    const skill = profile.skills.find((candidate) => candidate.name === "Accessibility")!
    expect(skill).toMatchObject({ source: "userAdded" })
    expect(profile.workExperiences[0]!.skillIds).toEqual(["skill_react", skill.id])
    expect(profile.workExperiences[0]!.source).toBe("userEdited")
    expect(profile.version).toBe(profileResponseMock.profile!.version + 1)
  })

  it("reuses matching skills and creates duplicate draft names only once", async () => {
    const values = [structuredClone(profileResponseMock.profile!.workExperiences[0]!)]
    values.push({
      ...structuredClone(values[0]!),
      id: "draft_work_second",
      skillIds: ["draft_skill_react", "draft_skill_accessibility_two"],
    })
    values[0]!.skillIds = ["draft_skill_react", "draft_skill_accessibility_one"]

    const profile = await saveProfile({
      profileId: profileResponseMock.profile!.profileId,
      section: "workExperience",
      skillsToCreate: [
        { clientId: "draft_skill_react", name: " react " },
        { clientId: "draft_skill_accessibility_one", name: "Accessibility" },
        { clientId: "draft_skill_accessibility_two", name: "accessibility" },
      ],
      values,
      version: profileResponseMock.profile!.version,
    })

    const accessibilitySkills = profile.skills.filter(
      (skill) => skill.name.toLowerCase() === "accessibility",
    )
    expect(accessibilitySkills).toHaveLength(1)
    expect(profile.workExperiences[0]!.skillIds[0]).toBe("skill_react")
    expect(profile.workExperiences[0]!.skillIds[1]).toBe(accessibilitySkills[0]!.id)
    expect(profile.workExperiences[1]!.skillIds).toEqual([
      "skill_react",
      accessibilitySkills[0]!.id,
    ])
  })

  it("atomically creates a new skill and replaces its temporary project technology id", async () => {
    const values = [structuredClone(profileResponseMock.profile!.projectExperiences[0]!)]
    values[0]!.skillIds = ["skill_react", "draft_skill_tanstack_router"]

    const profile = await saveProfile({
      profileId: profileResponseMock.profile!.profileId,
      section: "projectExperience",
      skillsToCreate: [{ clientId: "draft_skill_tanstack_router", name: "TanStack Router" }],
      values,
      version: profileResponseMock.profile!.version,
    })

    const skill = profile.skills.find((candidate) => candidate.name === "TanStack Router")!
    expect(skill).toMatchObject({ source: "userAdded" })
    expect(profile.projectExperiences[0]!.skillIds).toEqual(["skill_react", skill.id])
    expect(profile.projectExperiences[0]!.source).toBe("userEdited")
    expect(profile.version).toBe(profileResponseMock.profile!.version + 1)
  })

  it("does not partially save a new skill or project experience for a stale version", async () => {
    const promise = saveProfileSection({
      profileId: profileResponseMock.profile!.profileId,
      section: "projectExperience",
      skillsToCreate: [{ clientId: "draft_skill_tanstack_router", name: "TanStack Router" }],
      values: structuredClone(profileResponseMock.profile!.projectExperiences).map((project) => ({
        ...project,
        skillIds: ["draft_skill_tanstack_router"],
      })),
      version: -1,
    })
    const assertion = expect(promise).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await assertion

    const current = await settle(getJobProfile())
    expect(current.profile!.skills.some((skill) => skill.name === "TanStack Router")).toBe(false)
    expect(current.profile!.projectExperiences).toEqual(
      profileResponseMock.profile!.projectExperiences,
    )
  })

  it("does not partially save a new skill or work experience for a stale version", async () => {
    const promise = saveProfileSection({
      profileId: profileResponseMock.profile!.profileId,
      section: "workExperience",
      skillsToCreate: [{ clientId: "draft_skill_accessibility", name: "Accessibility" }],
      values: structuredClone(profileResponseMock.profile!.workExperiences).map((experience) => ({
        ...experience,
        skillIds: ["draft_skill_accessibility"],
      })),
      version: -1,
    })
    const assertion = expect(promise).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await assertion

    const current = await settle(getJobProfile())
    expect(current.profile!.skills.some((skill) => skill.name === "Accessibility")).toBe(false)
    expect(current.profile!.workExperiences).toEqual(profileResponseMock.profile!.workExperiences)
  })

  it("accepts a file or pasted text for upload and never returns File in server data", async () => {
    await settle(
      resetInitialResumeImport(
        profileResponseMock.profile!.profileId,
        profileResponseMock.profile!.resume!.id,
      ),
    )
    const initial = await settle(uploadInitialResume({ text: "resume body" }))
    expect(initial.profile!.resume).toMatchObject({
      fileName: "pasted-resume.txt",
      mimeType: "text/plain",
    })
    expect(initial.profile!.resume).not.toBeInstanceOf(File)

    const updated = await settle(
      uploadUpdatedResume({
        file: new File(["resume"], "updated.pdf", { type: "application/pdf" }),
      }),
    )
    expect(updated.resumeUpdate!.resume.fileName).toBe("updated.pdf")
    expect(updated.resumeUpdate!.resume).not.toBeInstanceOf(File)
  })

  it("rejects an initial upload when a profile already exists", async () => {
    const promise = uploadInitialResume({ text: "resume body" })
    const assertion = expect(promise).rejects.toThrow("resume update workflow")
    await vi.runAllTimersAsync()
    await assertion
  })

  it("keeps initial upload data empty until recognition completes", async () => {
    await settle(
      resetInitialResumeImport(
        profileResponseMock.profile!.profileId,
        profileResponseMock.profile!.resume!.id,
      ),
    )
    const uploading = await settle(uploadInitialResume({ text: "resume body" }))
    expect(uploading.profile).toMatchObject({ status: "uploadingResume" })
    expect(uploading.profile!.resume).toMatchObject({ processingStatus: "uploaded" })
    expect(uploading.profile!.education).toEqual([])
    expect(uploading.profile!.workExperiences).toEqual([])
    expect(uploading.profile!.projectExperiences).toEqual([])
    expect(uploading.profile!.skills).toEqual([])

    const parsing = await settle(
      startInitialResumeRecognition(uploading.profile!.profileId, uploading.profile!.resume!.id),
    )
    expect(parsing.profile).toMatchObject({ status: "parsingResume" })
    expect(parsing.profile!.resume).toMatchObject({ processingStatus: "parsing" })
    expect(parsing.recognition).toMatchObject({ processingStatus: "parsing" })

    const recognition = await settle(
      getResumeRecognitionStatus(parsing.profile!.profileId, parsing.profile!.resume!.id),
    )
    const recognized = await settle(getJobProfile())

    expect(recognition).toMatchObject({ processingStatus: "succeeded" })
    expect(recognized.profile).toMatchObject({ status: "active" })
    expect(recognized.profile!.resume).toMatchObject({ processingStatus: "succeeded" })
    expect(recognized.profile!.education[0]!.source).toBe("resumeExtracted")

    const repeatedStart = await settle(
      startInitialResumeRecognition(recognized.profile!.profileId, recognized.profile!.resume!.id),
    )
    expect(repeatedStart).toEqual(recognized)
  })

  it("keeps a safe failure reason when recognition fails", async () => {
    await settle(
      resetInitialResumeImport(
        profileResponseMock.profile!.profileId,
        profileResponseMock.profile!.resume!.id,
      ),
    )
    const uploading = await settle(
      uploadInitialResume({
        file: new File(["unreadable"], "unreadable-resume.pdf", { type: "application/pdf" }),
      }),
    )
    const parsing = await settle(
      startInitialResumeRecognition(uploading.profile!.profileId, uploading.profile!.resume!.id),
    )
    const recognition = await settle(
      getResumeRecognitionStatus(parsing.profile!.profileId, parsing.profile!.resume!.id),
    )
    const failed = await settle(getJobProfile())

    expect(recognition).toMatchObject({ processingStatus: "failed" })
    expect(failed.profile).toMatchObject({ status: "recognitionFailed" })
    expect(failed.profile!.resume).toMatchObject({ processingStatus: "failed" })
    expect(failed.recognition!.failureReason).toContain("text layer")
    expect(failed.recognition!.completedAt).not.toBeNull()
  })

  it("retries a failed initial recognition through parsing and clears failed job fields", async () => {
    await settle(
      resetInitialResumeImport(
        profileResponseMock.profile!.profileId,
        profileResponseMock.profile!.resume!.id,
      ),
    )
    const uploading = await settle(
      uploadInitialResume({
        file: new File(["retryable"], "retryable-resume.pdf", { type: "application/pdf" }),
      }),
    )
    const parsing = await settle(
      startInitialResumeRecognition(uploading.profile!.profileId, uploading.profile!.resume!.id),
    )
    const duplicateStart = await settle(
      startInitialResumeRecognition(parsing.profile!.profileId, parsing.profile!.resume!.id),
    )
    expect(duplicateStart).toEqual(parsing)

    await settle(
      getResumeRecognitionStatus(parsing.profile!.profileId, parsing.profile!.resume!.id),
    )
    const failed = await settle(getJobProfile())
    expect(failed).toMatchObject({
      profile: { status: "recognitionFailed", resume: { processingStatus: "failed" } },
      recognition: { processingStatus: "failed" },
    })
    expect(failed.recognition!.failureReason).not.toBeNull()
    expect(failed.recognition!.completedAt).not.toBeNull()

    const retried = await settle(
      startInitialResumeRecognition(failed.profile!.profileId, failed.profile!.resume!.id),
    )
    expect(retried).toMatchObject({
      profile: {
        status: "parsingResume",
        resume: { failureReason: null, parsedAt: null, processingStatus: "parsing" },
      },
      recognition: { completedAt: null, failureReason: null, processingStatus: "parsing" },
    })

    await settle(
      getResumeRecognitionStatus(retried.profile!.profileId, retried.profile!.resume!.id),
    )
    const succeeded = await settle(getJobProfile())
    expect(succeeded).toMatchObject({
      profile: { status: "active", resume: { processingStatus: "succeeded" } },
      recognition: { processingStatus: "succeeded" },
    })
  })

  it("can fail again after retrying a persistently unreadable initial resume", async () => {
    await settle(
      resetInitialResumeImport(
        profileResponseMock.profile!.profileId,
        profileResponseMock.profile!.resume!.id,
      ),
    )
    const uploading = await settle(
      uploadInitialResume({
        file: new File(["unreadable"], "unreadable-resume.pdf", { type: "application/pdf" }),
      }),
    )
    const parsing = await settle(
      startInitialResumeRecognition(uploading.profile!.profileId, uploading.profile!.resume!.id),
    )
    await settle(
      getResumeRecognitionStatus(parsing.profile!.profileId, parsing.profile!.resume!.id),
    )
    const failed = await settle(getJobProfile())

    const retried = await settle(
      startInitialResumeRecognition(failed.profile!.profileId, failed.profile!.resume!.id),
    )
    expect(retried.profile).toMatchObject({ status: "parsingResume" })
    await settle(
      getResumeRecognitionStatus(retried.profile!.profileId, retried.profile!.resume!.id),
    )

    const failedAgain = await settle(getJobProfile())
    expect(failedAgain).toMatchObject({
      profile: { status: "recognitionFailed", resume: { processingStatus: "failed" } },
      recognition: { processingStatus: "failed" },
    })
  })

  it("keeps the active resume when an update cannot be recognized", async () => {
    const originalResumeId = profileResponseMock.profile!.resume!.id
    const uploading = await settle(
      uploadUpdatedResume({
        file: new File(["unreadable"], "unreadable-update.pdf", { type: "application/pdf" }),
      }),
    )
    const parsing = await settle(
      startUpdatedResumeRecognition(uploading.profile!.profileId, uploading.resumeUpdate!.id),
    )
    await settle(getResumeUpdateStatus(parsing.profile!.profileId, parsing.resumeUpdate!.id))
    const failed = await settle(getJobProfile())

    expect(failed.profile).toMatchObject({ status: "active" })
    expect(failed.profile!.resume!.id).toBe(originalResumeId)
    expect(failed.resumeUpdate).toMatchObject({ status: "failed" })
    expect(failed.resumeUpdate!.failureReason).toContain("text layer")
  })

  it("updates a manual profile without a resume and preserves user content", async () => {
    const manual = await settle(createManualJobProfile())
    const firstSave = await settle(
      saveProfileSection({
        profileId: manual.profile!.profileId,
        version: manual.profile!.version,
        section: "skills",
        values: [{ id: "skill_custom", name: "Custom workflow", source: "userAdded" }],
      }),
    )
    const secondSave = await settle(
      saveProfileSection({
        profileId: firstSave.profile!.profileId,
        version: firstSave.profile!.version,
        section: "skills",
        values: [
          { id: "skill_custom", name: "Custom workflow edited", source: "userAdded" },
          { id: "skill_added", name: "Portfolio review", source: "userAdded" },
        ],
      }),
    )
    const uploading = await settle(uploadUpdatedResume({ text: "manual profile resume" }))
    expect(uploading).toMatchObject({
      profile: { profileId: manual.profile!.profileId, resume: null, status: "active" },
      resumeUpdate: { status: "uploading" },
    })
    const parsing = await settle(
      startUpdatedResumeRecognition(uploading.profile!.profileId, uploading.resumeUpdate!.id),
    )
    await settle(getResumeUpdateStatus(parsing.profile!.profileId, parsing.resumeUpdate!.id))
    const updated = await settle(getJobProfile())

    expect(updated.profile).toMatchObject({
      resume: { processingStatus: "succeeded" },
      version: secondSave.profile!.version + 1,
    })
    expect(updated.profile!.skills).toContainEqual(
      expect.objectContaining({ id: "skill_custom", source: "userEdited" }),
    )
    expect(updated.profile!.skills).toContainEqual(
      expect.objectContaining({ id: "skill_added", source: "userAdded" }),
    )
  })

  it("keeps a manual profile without a resume after a failed resume update", async () => {
    const manual = await settle(createManualJobProfile())
    const uploading = await settle(
      uploadUpdatedResume({
        file: new File(["unreadable"], "unreadable-manual-resume.pdf", {
          type: "application/pdf",
        }),
      }),
    )
    const parsing = await settle(
      startUpdatedResumeRecognition(uploading.profile!.profileId, uploading.resumeUpdate!.id),
    )
    await settle(getResumeUpdateStatus(parsing.profile!.profileId, parsing.resumeUpdate!.id))
    const failed = await settle(getJobProfile())

    expect(failed).toMatchObject({
      profile: { profileId: manual.profile!.profileId, resume: null, status: "active" },
      resumeUpdate: { status: "failed" },
    })
    expect(failed.profile!.status).not.toBe("recognitionFailed")
  })

  it("merges a new resume without overwriting manual profile content", async () => {
    const beforeUpdate = await settle(getJobProfile())
    const manuallyEditedCompany = beforeUpdate.profile!.workExperiences[0]!.company
    const userAddedSkill = beforeUpdate.profile!.skills.find(
      (skill) => skill.source === "userAdded",
    )!
    const uploading = await settle(uploadUpdatedResume({ text: "updated resume" }))
    const parsing = await settle(
      startUpdatedResumeRecognition(uploading.profile!.profileId, uploading.resumeUpdate!.id),
    )
    expect(parsing.profile).toMatchObject({ status: "active" })
    expect(parsing.resumeUpdate).toMatchObject({ status: "parsing" })
    await settle(getResumeUpdateStatus(parsing.profile!.profileId, parsing.resumeUpdate!.id))
    const updated = await settle(getJobProfile())

    expect(updated.profile!.workExperiences[0]!.company).toBe(manuallyEditedCompany)
    expect(updated.profile!.skills).toContainEqual(userAddedSkill)
    expect(updated.profile!.skills).toContainEqual(
      expect.objectContaining({ id: "skill_accessibility", source: "resumeExtracted" }),
    )
    expect(updated.resumeUpdate).toMatchObject({
      changeSummary: { changedItems: 2, missingItems: 1, newItems: 1 },
      status: "succeeded",
    })
  })

  it("increments the version when saving a manual profile", async () => {
    const manual = await settle(createManualJobProfile())
    const saved = await settle(
      saveProfileSection({
        profileId: manual.profile!.profileId,
        version: manual.profile!.version,
        section: "skills",
        values: [],
      }),
    )

    expect(saved.profile).toMatchObject({ version: 2 })
  })

  it("rejects an upload without a file or pasted text", async () => {
    const promise = uploadInitialResume({})
    const assertion = expect(promise).rejects.toThrow("required")
    await vi.runAllTimersAsync()
    await assertion
  })
})
