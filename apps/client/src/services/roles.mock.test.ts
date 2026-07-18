import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  generateMatchingAnalysis,
  getJobDescriptionParsingStatus,
  getMatchingAnalysisStatus,
  getRolesPage,
  resetRolesMockState,
  saveJobDescription,
  setCurrentTargetRole,
  startJobDescriptionParsing,
  updateTargetRole,
} from "@/services/roles"

const newRole = {
  title: "Frontend Platform Engineer",
  company: "Shopify",
  recruitmentType: "experienced" as const,
  location: "Remote",
  experienceRange: { minYears: 4, maxYears: null },
  preparationStatus: "preparing" as const,
}

beforeEach(() => {
  vi.useFakeTimers()
  resetRolesMockState()
})

afterEach(() => {
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>) {
  await vi.runAllTimersAsync()
  return promise
}

async function getCurrentRole() {
  const response = await settle(getRolesPage())
  const role = response.roles.find((candidate) => candidate.isCurrent)
  if (!role) throw new Error("The mock response does not have a current role.")
  return role
}

async function saveAndParseCurrentRole(rawText: string) {
  const currentRole = await getCurrentRole()
  const parsing = await settle(
    saveJobDescription({ roleId: currentRole.id, version: currentRole.version, rawText }),
  )
  const parsingRole = parsing.roles.find((role) => role.id === currentRole.id)!
  return settle(getJobDescriptionParsingStatus(parsingRole.id))
}

describe("roles stateful mock service", () => {
  it("creates the first role as current", async () => {
    resetRolesMockState("noRoles")

    const response = await settle(createTargetRole(newRole))

    expect(response.currentRoleId).toBe("role_created_1")
    expect(response.roles).toHaveLength(1)
    expect(response.roles[0]).toMatchObject({ isCurrent: true, version: 1 })
  })

  it("keeps the existing current role when creating additional roles", async () => {
    resetRolesMockState("noRoles")
    const first = await settle(createTargetRole(newRole))
    const second = await settle(createTargetRole({ ...newRole, title: "Frontend Engineer" }))

    expect(second.currentRoleId).toBe(first.currentRoleId)
    expect(second.roles.filter((role) => role.isCurrent)).toHaveLength(1)
    expect(second.roles).toHaveLength(2)
  })

  it("atomically switches the current role", async () => {
    resetRolesMockState("noRoles")
    const first = await settle(createTargetRole(newRole))
    const firstRole = first.roles[0]!
    const second = await settle(createTargetRole({ ...newRole, title: "Frontend Engineer" }))
    const secondRole = second.roles[1]!

    const switched = await settle(
      setCurrentTargetRole({ roleId: secondRole.id, version: secondRole.version }),
    )

    expect(switched.currentRoleId).toBe(secondRole.id)
    expect(switched.roles.find((role) => role.id === firstRole.id)!.isCurrent).toBe(false)
    expect(switched.roles.find((role) => role.id === secondRole.id)!.isCurrent).toBe(true)
  })

  it("archives the current role and promotes a preparing fallback", async () => {
    resetRolesMockState("noRoles")
    const first = await settle(createTargetRole(newRole))
    const firstRole = first.roles[0]!
    const second = await settle(createTargetRole({ ...newRole, title: "Frontend Engineer" }))
    const secondRole = second.roles[1]!

    const archived = await settle(
      archiveTargetRole({ roleId: firstRole.id, version: firstRole.version }),
    )

    expect(archived.currentRoleId).toBe(secondRole.id)
    expect(archived.roles.find((role) => role.id === firstRole.id)).toMatchObject({
      isCurrent: false,
      preparationStatus: "archived",
    })
  })

  it("deletes the current role and promotes a preparing fallback", async () => {
    resetRolesMockState("noRoles")
    const first = await settle(createTargetRole(newRole))
    const firstRole = first.roles[0]!
    const second = await settle(createTargetRole({ ...newRole, title: "Frontend Engineer" }))
    const secondRole = second.roles[1]!

    const deleted = await settle(
      deleteTargetRole({ roleId: firstRole.id, version: firstRole.version }),
    )

    expect(deleted.currentRoleId).toBe(secondRole.id)
    expect(deleted.roles.map((role) => role.id)).not.toContain(firstRole.id)
  })

  it("rejects stale versions without partially writing the role", async () => {
    const before = await getCurrentRole()
    const promise = updateTargetRole({
      roleId: before.id,
      version: before.version - 1,
      title: "Changed title",
      company: before.company,
      recruitmentType: before.recruitmentType,
      location: before.location,
      experienceRange: before.experienceRange,
    })
    const assertion = expect(promise).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await assertion

    const after = await getCurrentRole()
    expect(after).toMatchObject({ title: before.title, version: before.version })
  })

  it("saves JD text as a parsing job and completes parsing successfully", async () => {
    resetRolesMockState("singleRoleWithoutJobDescription")
    const role = await getCurrentRole()
    const parsing = await settle(
      saveJobDescription({
        roleId: role.id,
        version: role.version,
        rawText: "Lead React and TypeScript delivery for merchant operations products.",
      }),
    )
    const parsingRole = parsing.roles[0]!

    expect(parsingRole.jobDescription).toMatchObject({ status: "parsing", version: 1 })
    expect(parsingRole.jobDescriptionAnalysis).toBeNull()

    const ready = await settle(getJobDescriptionParsingStatus(role.id))
    expect(ready.jobDescription.status).toBe("ready")
    expect(ready.jobDescriptionAnalysis).not.toBeNull()
  })

  it("keeps failed JD text and supports a successful retry", async () => {
    resetRolesMockState("singleRoleWithoutJobDescription")
    const failed = await saveAndParseCurrentRole(
      "Retryable JD parsing issue for a React and TypeScript role.",
    )

    expect(failed.jobDescription).toMatchObject({ status: "failed" })
    expect(failed.jobDescriptionAnalysis).toBeNull()
    if (failed.jobDescription.status !== "failed") throw new Error("Expected a failed JD parse.")

    const retrying = await settle(
      startJobDescriptionParsing({
        roleId: failed.id,
        version: failed.version,
        jobDescriptionVersion: failed.jobDescription.version,
      }),
    )
    const retryingRole = retrying.roles[0]!
    const ready = await settle(getJobDescriptionParsingStatus(retryingRole.id))

    expect(retryingRole.jobDescription.status).toBe("parsing")
    expect(ready.jobDescription.status).toBe("ready")
  })

  it("allows a failed JD retry to fail again when the source remains unparseable", async () => {
    resetRolesMockState("singleRoleWithoutJobDescription")
    const failed = await saveAndParseCurrentRole("Unparseable copied PDF content.")
    if (failed.jobDescription.status !== "failed") throw new Error("Expected a failed JD parse.")

    const retrying = await settle(
      startJobDescriptionParsing({
        roleId: failed.id,
        version: failed.version,
        jobDescriptionVersion: failed.jobDescription.version,
      }),
    )
    const failedAgain = await settle(getJobDescriptionParsingStatus(retrying.roles[0]!.id))

    expect(failedAgain.jobDescription).toMatchObject({ status: "failed" })
    expect(failedAgain.jobDescriptionAnalysis).toBeNull()
  })

  it("does not create a second JD parsing task while one is running", async () => {
    resetRolesMockState("singleRoleWithoutJobDescription")
    const role = await getCurrentRole()
    const parsing = await settle(
      saveJobDescription({
        roleId: role.id,
        version: role.version,
        rawText: "Lead React and TypeScript delivery for merchant operations products.",
      }),
    )
    const parsingRole = parsing.roles[0]!

    const repeatedStart = await settle(
      startJobDescriptionParsing({
        roleId: parsingRole.id,
        version: parsingRole.version,
        jobDescriptionVersion: parsingRole.jobDescription.version!,
      }),
    )

    expect(repeatedStart).toEqual(parsing)
  })

  it("marks an existing matching analysis stale when JD text changes", async () => {
    const role = await getCurrentRole()
    expect(role.matchingAnalysis?.status).toBe("current")

    const saved = await settle(
      saveJobDescription({
        roleId: role.id,
        version: role.version,
        rawText: "Updated JD requiring React, TypeScript, accessibility, and technical leadership.",
      }),
    )

    expect(saved.roles[0]!.matchingAnalysis).toMatchObject({
      status: "stale",
      jobDescriptionVersion: 4,
      profileVersion: 12,
    })
  })

  it("keeps matching analysis null after JD changes when none existed", async () => {
    resetRolesMockState("roleWithParsedJobDescription")
    const role = await getCurrentRole()

    const saved = await settle(
      saveJobDescription({
        roleId: role.id,
        version: role.version,
        rawText: "Updated JD requiring React and TypeScript delivery.",
      }),
    )

    expect(saved.roles[0]!.matchingAnalysis).toBeNull()
  })

  it.each(["profileMissing", "profileIncomplete"] as const)(
    "rejects matching analysis when %s prevents profile prerequisites",
    async (scenario) => {
      resetRolesMockState(scenario)
      const role = await getCurrentRole()
      const promise = generateMatchingAnalysis({ roleId: role.id, version: role.version })
      const assertion = expect(promise).rejects.toThrow("completed job profile")
      await vi.runAllTimersAsync()
      await assertion
    },
  )

  it("rejects matching analysis before the JD is parsed", async () => {
    resetRolesMockState("singleRoleWithoutJobDescription")
    const role = await getCurrentRole()
    const promise = generateMatchingAnalysis({ roleId: role.id, version: role.version })
    const assertion = expect(promise).rejects.toThrow("parsed job description")
    await vi.runAllTimersAsync()
    await assertion
  })

  it("generates a current matching analysis after polling", async () => {
    resetRolesMockState("roleWithParsedJobDescription")
    const role = await getCurrentRole()
    const generating = await settle(
      generateMatchingAnalysis({ roleId: role.id, version: role.version }),
    )
    const generatingRole = generating.roles[0]!

    expect(generatingRole.matchingAnalysis?.status).toBe("generating")
    const current = await settle(getMatchingAnalysisStatus(generatingRole.id))

    expect(current.matchingAnalysis).toMatchObject({
      status: "current",
      profileVersion: 12,
      jobDescriptionVersion: 4,
    })
  })

  it("does not create a second matching-analysis task while one is running", async () => {
    resetRolesMockState("roleWithParsedJobDescription")
    const role = await getCurrentRole()
    const generating = await settle(
      generateMatchingAnalysis({ roleId: role.id, version: role.version }),
    )
    const generatingRole = generating.roles[0]!

    const repeatedGeneration = await settle(
      generateMatchingAnalysis({ roleId: generatingRole.id, version: generatingRole.version }),
    )

    expect(repeatedGeneration).toEqual(generating)
  })

  it("records a matching-analysis generation failure", async () => {
    resetRolesMockState("singleRoleWithoutJobDescription")
    const ready = await saveAndParseCurrentRole(
      "Lead React delivery while the analysis-failure integration is unavailable.",
    )
    if (ready.jobDescription.status !== "ready") throw new Error("Expected a ready JD.")

    const generating = await settle(
      generateMatchingAnalysis({ roleId: ready.id, version: ready.version }),
    )
    const failed = await settle(getMatchingAnalysisStatus(generating.roles[0]!.id))

    expect(failed.matchingAnalysis).toMatchObject({ status: "failed" })
  })

  it("regenerates a stale analysis into a current analysis", async () => {
    resetRolesMockState("matchingAnalysisStale")
    const role = await getCurrentRole()
    const generating = await settle(
      generateMatchingAnalysis({ roleId: role.id, version: role.version }),
    )
    const current = await settle(getMatchingAnalysisStatus(generating.roles[0]!.id))

    expect(current.matchingAnalysis).toMatchObject({
      status: "current",
      profileVersion: 12,
      jobDescriptionVersion: 4,
    })
  })
})
