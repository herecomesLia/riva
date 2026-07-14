import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { profileResponseMock } from "@/mocks/data/profile"
import {
  getJobProfile,
  saveProfileSection,
  uploadInitialResume,
  uploadUpdatedResume,
} from "@/services/profile"

describe("profile mock service", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function settle<T>(promise: Promise<T>) {
    await vi.runAllTimersAsync()
    return promise
  }

  it("returns the one standard fixture after the configured mock delay", async () => {
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
    first.profile!.basicInformation.name = "mutated"
    expect(second).toEqual(profileResponseMock)
    expect(second).not.toBe(first)
    expect(second.profile).not.toBe(first.profile)
  })

  it("saves a typed section without mutating the standard fixture", async () => {
    const values = {
      ...structuredClone(profileResponseMock.profile!.basicInformation),
      name: "Updated Name",
    }
    const profile = await settle(
      saveProfileSection({
        profileId: profileResponseMock.profile!.profileId,
        version: profileResponseMock.profile!.version,
        section: "basicInformation",
        values,
      }),
    )
    expect(profile.basicInformation.name).toBe("Updated Name")
    expect(profile.version).toBe(profileResponseMock.profile!.version + 1)
    expect(profile.matchingAnalysisStale).toBe(true)
    expect(profileResponseMock.profile!.basicInformation.name).toBe("Lin Chen")
  })

  it("retains the target-role section contract for the future Roles module", async () => {
    const values = structuredClone(profileResponseMock.profile!.targetRoles)
    values[0]!.title = "Principal Frontend Engineer"
    const profile = await settle(
      saveProfileSection({
        profileId: profileResponseMock.profile!.profileId,
        version: profileResponseMock.profile!.version,
        section: "targetRoles",
        values,
      }),
    )

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

  it("accepts a file or pasted text for upload and never returns File in server data", async () => {
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

  it("rejects an upload without a file or pasted text", async () => {
    const promise = uploadInitialResume({})
    const assertion = expect(promise).rejects.toThrow("required")
    await vi.runAllTimersAsync()
    await assertion
  })
})
