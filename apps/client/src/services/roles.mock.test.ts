import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetRolesMockState } from "@/mocks/services/roles"
import {
  archiveTargetRole,
  createTargetRole,
  createTargetRoleFromRecognition,
  deleteTargetRole,
  generateMatchingAnalysis,
  getJobDescriptionParsingStatus,
  getMatchingAnalysisStatus,
  getRolesPage,
  saveJobDescription,
  recognizeTargetRole,
  setCurrentTargetRole,
  startJobDescriptionParsing,
  updateRolePreparationStatus,
  updateJobDescriptionAnalysisModule,
  updateTargetRole,
} from "@/services/roles"
import type { TargetRole } from "@/models/roles"

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

function getJobDescriptionPollInput(role: TargetRole) {
  const jobDescriptionVersion = role.jobDescription.version
  if (jobDescriptionVersion === null) throw new Error("Cannot poll a missing JD.")
  return { roleId: role.id, version: role.version, jobDescriptionVersion }
}

function getMatchingAnalysisPollInput(role: TargetRole) {
  return { roleId: role.id, version: role.version }
}

function pollJobDescription(role: TargetRole) {
  return settle(getJobDescriptionParsingStatus(getJobDescriptionPollInput(role)))
}

function pollMatchingAnalysis(role: TargetRole) {
  return settle(getMatchingAnalysisStatus(getMatchingAnalysisPollInput(role)))
}

async function getCurrentRole() {
  const response = await settle(getRolesPage())
  const role = response.roles.find((candidate) => candidate.id === response.currentRoleId)
  if (!role) throw new Error("The mock response does not have a current role.")
  return role
}

async function saveAndParseCurrentRole(rawText: string) {
  const currentRole = await getCurrentRole()
  const parsing = await settle(
    saveJobDescription({ roleId: currentRole.id, version: currentRole.version, rawText }),
  )
  const parsingRole = parsing.roles.find((role) => role.id === currentRole.id)!
  return pollJobDescription(parsingRole)
}

describe("roles stateful mock service", () => {
  it("provides an explicit two-ready-JD scenario without changing multipleRoles", async () => {
    resetRolesMockState("multipleRolesReady")
    const ready = await settle(getRolesPage())
    expect(ready.roles.map(({ jobDescription }) => jobDescription.status)).toEqual([
      "ready",
      "ready",
    ])

    resetRolesMockState("multipleRoles")
    const defaultMultiple = await settle(getRolesPage())
    expect(defaultMultiple.roles.map(({ jobDescription }) => jobDescription.status)).toEqual([
      "ready",
      "missing",
    ])
  })

  it("creates the first role as current", async () => {
    resetRolesMockState("noRoles")

    const response = await settle(createTargetRole(newRole))

    expect(response.currentRoleId).toBe("role_created_1")
    expect(response.roles).toHaveLength(1)
    expect(response.roles[0]).toMatchObject({ version: 1 })
    expect(response.roles[0]).not.toHaveProperty("isCurrent")
  })

  it("recognizes pasted job text into a reviewable role draft", async () => {
    const rawText = ["岗位名称：前端平台工程师", "公司：Riva", "工作地点：上海", "3-5 年经验"].join(
      "\n",
    )

    const result = await settle(recognizeTargetRole({ sourceType: "text", text: rawText }))

    expect(result).toMatchObject({
      recognitionId: "recognition_text_1",
      sourceType: "text",
      rawText,
      suggestedRole: {
        title: "前端平台工程师",
        company: "Riva",
        location: "上海",
        experienceRange: { minYears: 3, maxYears: 5 },
      },
    })
  })

  it("creates a recognized role and its parsing JD in one response", async () => {
    resetRolesMockState("noRoles")
    const rawText = "Frontend Engineer\nBuild accessible React interfaces."

    const response = await settle(
      createTargetRoleFromRecognition({
        ...newRole,
        recognitionId: "recognition_text_1",
        rawText,
      }),
    )

    expect(response.currentRoleId).toBe("role_created_1")
    expect(response.roles).toHaveLength(1)
    expect(response.roles[0]).toMatchObject({
      title: newRole.title,
      version: 1,
      jobDescription: {
        status: "parsing",
        rawText,
        version: 1,
      },
      jobDescriptionAnalysis: null,
    })
  })

  it("keeps the existing current role when creating additional roles", async () => {
    resetRolesMockState("noRoles")
    const first = await settle(createTargetRole(newRole))
    const second = await settle(createTargetRole({ ...newRole, title: "Frontend Engineer" }))

    expect(second.currentRoleId).toBe(first.currentRoleId)
    expect(second.roles.every((role) => !("isCurrent" in role))).toBe(true)
    expect(second.roles).toHaveLength(2)
  })

  it("does not invent a current role when adding to an existing no-current collection", async () => {
    resetRolesMockState("rolesWithoutCurrent")

    const response = await settle(createTargetRole(newRole))

    expect(response.roles).toHaveLength(3)
    expect(response.currentRoleId).toBeNull()
    expect(response.roles.every((role) => !("isCurrent" in role))).toBe(true)
  })

  it("pauses and resumes preparation without changing the current role", async () => {
    const initial = await getCurrentRole()

    const paused = await settle(
      updateRolePreparationStatus({
        roleId: initial.id,
        version: initial.version,
        preparationStatus: "paused",
      }),
    )
    const pausedRole = paused.roles.find((role) => role.id === initial.id)!

    expect(paused).toMatchObject({ currentRoleId: initial.id })
    expect(paused.profileContext).toBeDefined()
    expect(pausedRole).toMatchObject({
      preparationStatus: "paused",
      version: initial.version + 1,
    })

    const resumed = await settle(
      updateRolePreparationStatus({
        roleId: pausedRole.id,
        version: pausedRole.version,
        preparationStatus: "preparing",
      }),
    )
    const resumedRole = resumed.roles.find((role) => role.id === initial.id)!

    expect(resumed.currentRoleId).toBe(initial.id)
    expect(resumedRole).toMatchObject({
      preparationStatus: "preparing",
      version: pausedRole.version + 1,
    })
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
    expect(switched.roles).toEqual(second.roles)
    expect(switched.roles.find((role) => role.id === firstRole.id)?.version).toBe(firstRole.version)
    expect(switched.roles.find((role) => role.id === secondRole.id)?.version).toBe(
      secondRole.version,
    )
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
      preparationStatus: "archived",
    })
  })

  it("leaves no current role when archiving the current role with only paused roles left", async () => {
    resetRolesMockState("multipleRoles")
    const currentRole = await getCurrentRole()

    const archived = await settle(
      archiveTargetRole({ roleId: currentRole.id, version: currentRole.version }),
    )
    const remainingRoles = archived.roles.filter((role) => role.preparationStatus !== "archived")

    expect(remainingRoles.length).toBeGreaterThan(0)
    expect(remainingRoles.every((role) => role.preparationStatus === "paused")).toBe(true)
    expect(archived.currentRoleId).toBeNull()
    expect(archived.roles.every((role) => !("isCurrent" in role))).toBe(true)
  })

  it("rejects setting an archived role as current without partial writes", async () => {
    resetRolesMockState("archivedRoles")
    const before = await settle(getRolesPage())
    const archivedRole = before.roles.find((role) => role.preparationStatus === "archived")!
    const promise = setCurrentTargetRole({
      roleId: archivedRole.id,
      version: archivedRole.version,
    })
    const assertion = expect(promise).rejects.toThrow("archived target role")
    await vi.runAllTimersAsync()
    await assertion

    const after = await settle(getRolesPage())
    expect(after).toEqual(before)
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

  it("leaves no current role when deleting the current role with only paused roles left", async () => {
    resetRolesMockState("multipleRoles")
    const currentRole = await getCurrentRole()

    const deleted = await settle(
      deleteTargetRole({ roleId: currentRole.id, version: currentRole.version }),
    )

    expect(deleted.roles.length).toBeGreaterThan(0)
    expect(deleted.roles.every((role) => role.preparationStatus === "paused")).toBe(true)
    expect(deleted.currentRoleId).toBeNull()
    expect(deleted.roles.every((role) => !("isCurrent" in role))).toBe(true)
  })

  it("clears current role state when deleting the only role", async () => {
    resetRolesMockState("singleRoleWithoutJobDescription")
    const role = await getCurrentRole()

    const deleted = await settle(deleteTargetRole({ roleId: role.id, version: role.version }))

    expect(deleted.roles).toEqual([])
    expect(deleted.currentRoleId).toBeNull()
  })

  it("returns independent role snapshots without exposing internal mock state", async () => {
    resetRolesMockState("roleWithParsedJobDescription")
    const first = await settle(getRolesPage())
    const firstRole = first.roles[0]!
    const firstAnalysis = firstRole.jobDescriptionAnalysis
    if (!firstAnalysis) throw new Error("Expected the parsed JD fixture to include analysis.")

    const originalTitle = firstRole.title
    const originalRequiredSkill = firstAnalysis.requiredSkills.programmingLanguages[0]
    firstRole.title = "Mutated role title"
    firstAnalysis.requiredSkills.programmingLanguages[0] = "Mutated skill"

    const second = await settle(getRolesPage())
    expect(second.roles[0]).toMatchObject({ title: originalTitle })
    expect(second.roles[0]!.jobDescriptionAnalysis?.requiredSkills.programmingLanguages[0]).toBe(
      originalRequiredSkill,
    )
    expect(second).not.toBe(first)
    expect(second.roles[0]).not.toBe(firstRole)
  })

  it("updates only the requested structured JD module and makes a current analysis stale", async () => {
    const before = await getCurrentRole()
    if (before.jobDescription.status !== "ready" || !before.jobDescriptionAnalysis) {
      throw new Error("Expected a ready JD analysis.")
    }
    const previousAnalysis = structuredClone(before.jobDescriptionAnalysis)
    const previousMatchingAnalysis = structuredClone(before.matchingAnalysis)

    const response = await settle(
      updateJobDescriptionAnalysisModule({
        roleId: before.id,
        version: before.version,
        jobDescriptionVersion: before.jobDescription.version,
        analysisVersion: previousAnalysis.analysisVersion,
        field: "qualificationRequirements",
        value: {
          ...previousAnalysis.qualificationRequirements,
          experience: ["Three years of frontend engineering experience."],
        },
      }),
    )
    const updated = response.roles.find((role) => role.id === before.id)!
    if (updated.jobDescription.status !== "ready" || !updated.jobDescriptionAnalysis) {
      throw new Error("Expected the structured JD analysis to remain ready.")
    }

    expect(updated.jobDescription.rawText).toBe(before.jobDescription.rawText)
    expect(updated.jobDescription.version).toBe(before.jobDescription.version)
    expect(updated.jobDescriptionAnalysis).toMatchObject({
      qualificationRequirements: {
        ...previousAnalysis.qualificationRequirements,
        experience: ["Three years of frontend engineering experience."],
      },
      responsibilities: previousAnalysis.responsibilities,
      parsedAt: previousAnalysis.parsedAt,
      analysisVersion: previousAnalysis.analysisVersion + 1,
    })
    expect(updated.jobDescriptionAnalysis.rivaSummary).not.toBe(previousAnalysis.rivaSummary)
    expect(updated.version).toBe(before.version + 1)
    expect(updated.matchingAnalysis).toEqual({ ...previousMatchingAnalysis, status: "stale" })
  })

  it("accepts empty structured list modules while preserving the input order", async () => {
    const before = await getCurrentRole()
    if (before.jobDescription.status !== "ready" || !before.jobDescriptionAnalysis) {
      throw new Error("Expected a ready JD analysis.")
    }

    const response = await settle(
      updateJobDescriptionAnalysisModule({
        roleId: before.id,
        version: before.version,
        jobDescriptionVersion: before.jobDescription.version,
        analysisVersion: before.jobDescriptionAnalysis.analysisVersion,
        field: "preferredQualifications",
        value: ["Accessibility", "Experiment design", "Accessibility"],
      }),
    )
    const updated = response.roles.find((role) => role.id === before.id)!
    expect(updated.jobDescriptionAnalysis?.preferredQualifications).toEqual([
      "Accessibility",
      "Experiment design",
      "Accessibility",
    ])
  })

  it("updates all required-skill groups together without changing qualifications", async () => {
    const before = await getCurrentRole()
    if (before.jobDescription.status !== "ready" || !before.jobDescriptionAnalysis) {
      throw new Error("Expected a ready JD analysis.")
    }
    const response = await settle(
      updateJobDescriptionAnalysisModule({
        roleId: before.id,
        version: before.version,
        jobDescriptionVersion: before.jobDescription.version,
        analysisVersion: before.jobDescriptionAnalysis.analysisVersion,
        field: "requiredSkills",
        value: {
          programmingLanguages: ["TypeScript", "Go"],
          frameworksAndLibraries: ["React", "LangChain"],
          platforms: ["Kubernetes"],
          tools: ["Docker"],
          conceptsAndMethods: ["RAG"],
          databasesAndMiddleware: ["Redis"],
          other: [],
        },
      }),
    )
    const updated = response.roles.find((role) => role.id === before.id)!.jobDescriptionAnalysis!
    expect(updated.requiredSkills.platforms).toEqual(["Kubernetes"])
    expect(updated.qualificationRequirements).toEqual(
      before.jobDescriptionAnalysis.qualificationRequirements,
    )
  })

  it("clears obsolete generating and failed analysis tasks after a structured correction", async () => {
    for (const scenario of ["matchingAnalysisGenerating", "matchingAnalysisFailed"] as const) {
      resetRolesMockState(scenario)
      const before = await getCurrentRole()
      if (before.jobDescription.status !== "ready" || !before.jobDescriptionAnalysis) {
        throw new Error("Expected a ready JD analysis.")
      }
      const response = await settle(
        updateJobDescriptionAnalysisModule({
          roleId: before.id,
          version: before.version,
          jobDescriptionVersion: before.jobDescription.version,
          analysisVersion: before.jobDescriptionAnalysis.analysisVersion,
          field: "businessDomains",
          value: ["React", "TypeScript"],
        }),
      )

      expect(response.roles.find((role) => role.id === before.id)!.matchingAnalysis).toBeNull()
    }
  })

  it("rejects stale structured-analysis versions without partial writes", async () => {
    const before = await getCurrentRole()
    if (before.jobDescription.status !== "ready" || !before.jobDescriptionAnalysis) {
      throw new Error("Expected a ready JD analysis.")
    }
    const promise = updateJobDescriptionAnalysisModule({
      roleId: before.id,
      version: before.version,
      jobDescriptionVersion: before.jobDescription.version,
      analysisVersion: before.jobDescriptionAnalysis.analysisVersion - 1,
      field: "requiredSkills",
      value: { ...before.jobDescriptionAnalysis.requiredSkills, programmingLanguages: ["React"] },
    })
    const assertion = expect(promise).rejects.toThrow("analysis version is out of date")
    await vi.runAllTimersAsync()
    await assertion

    expect(await getCurrentRole()).toEqual(before)
  })

  it("rejects structured corrections before JD parsing is ready", async () => {
    resetRolesMockState("roleWithJobDescriptionParsing")
    const role = await getCurrentRole()
    if (role.jobDescription.version === null) throw new Error("Expected a saved JD.")
    const promise = updateJobDescriptionAnalysisModule({
      roleId: role.id,
      version: role.version,
      jobDescriptionVersion: role.jobDescription.version,
      analysisVersion: 1,
      field: "responsibilities",
      value: ["Review architecture decisions."],
    })
    const assertion = expect(promise).rejects.toThrow("parsed job description")
    await vi.runAllTimersAsync()
    await assertion
    expect(await getCurrentRole()).toEqual(role)
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

    const ready = await pollJobDescription(parsingRole)
    expect(ready.jobDescription.status).toBe("ready")
    expect(ready.jobDescriptionAnalysis).not.toBeNull()
    expect(ready.jobDescriptionAnalysis?.analysisVersion).toBe(1)
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
    const ready = await pollJobDescription(retryingRole)

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
    const failedAgain = await pollJobDescription(retrying.roles[0]!)

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

  it("does not let an old JD poll advance a newer parsing job", async () => {
    resetRolesMockState("singleRoleWithoutJobDescription")
    const initial = await getCurrentRole()
    const responseA = await settle(
      saveJobDescription({
        roleId: initial.id,
        version: initial.version,
        rawText: "JD A requires React delivery experience.",
      }),
    )
    const parsingA = responseA.roles[0]!
    const responseB = await settle(
      saveJobDescription({
        roleId: parsingA.id,
        version: parsingA.version,
        rawText: "JD B requires TypeScript architecture experience.",
      }),
    )
    const parsingB = responseB.roles[0]!

    const stalePollResult = await settle(
      getJobDescriptionParsingStatus(getJobDescriptionPollInput(parsingA)),
    )

    expect(stalePollResult.version).toBe(parsingB.version)
    expect(stalePollResult.jobDescription).toMatchObject({
      status: "parsing",
      rawText: "JD B requires TypeScript architecture experience.",
      version: 2,
    })

    const readyB = await pollJobDescription(parsingB)
    expect(readyB.version).toBe(parsingB.version + 1)
    expect(readyB.jobDescription).toMatchObject({
      status: "ready",
      rawText: "JD B requires TypeScript architecture experience.",
      version: 2,
    })
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
    const current = await pollMatchingAnalysis(generatingRole)

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

  it("does not let an old analysis poll advance a newer retry task", async () => {
    resetRolesMockState("singleRoleWithoutJobDescription")
    const ready = await saveAndParseCurrentRole(
      "Lead React delivery while the analysis-failure integration is unavailable.",
    )
    const responseA = await settle(
      generateMatchingAnalysis({ roleId: ready.id, version: ready.version }),
    )
    const generatingA = responseA.roles[0]!
    const failedA = await pollMatchingAnalysis(generatingA)
    expect(failedA.matchingAnalysis?.status).toBe("failed")

    const responseB = await settle(
      generateMatchingAnalysis({ roleId: failedA.id, version: failedA.version }),
    )
    const generatingB = responseB.roles[0]!
    const stalePollResult = await settle(
      getMatchingAnalysisStatus(getMatchingAnalysisPollInput(generatingA)),
    )

    expect(stalePollResult.version).toBe(generatingB.version)
    expect(stalePollResult.matchingAnalysis?.status).toBe("generating")

    const failedB = await pollMatchingAnalysis(generatingB)
    expect(failedB.matchingAnalysis?.status).toBe("failed")
  })

  it("retries a failed fixture analysis using current dependency versions", async () => {
    resetRolesMockState("matchingAnalysisFailed")
    const failed = await getCurrentRole()
    expect(failed.matchingAnalysis?.status).toBe("failed")

    const generating = await settle(
      generateMatchingAnalysis({ roleId: failed.id, version: failed.version }),
    )
    const generatingRole = generating.roles[0]!
    const current = await pollMatchingAnalysis(generatingRole)

    expect(current.matchingAnalysis).toMatchObject({
      status: "current",
      profileVersion: 12,
      jobDescriptionVersion: 4,
    })
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
    const failed = await pollMatchingAnalysis(generating.roles[0]!)

    expect(failed.matchingAnalysis).toMatchObject({ status: "failed" })
  })

  it("regenerates a stale analysis into a current analysis", async () => {
    resetRolesMockState("matchingAnalysisStale")
    const role = await getCurrentRole()
    const generating = await settle(
      generateMatchingAnalysis({ roleId: role.id, version: role.version }),
    )
    const current = await pollMatchingAnalysis(generating.roles[0]!)

    expect(current.matchingAnalysis).toMatchObject({
      status: "current",
      profileVersion: 12,
      jobDescriptionVersion: 4,
    })
  })
})
