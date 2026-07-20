import { describe, expect, it } from "vitest"

import {
  createRolesMockResponse,
  rolesResponseMock,
  type RolesMockScenario,
} from "@/mocks/data/roles"
import type { RolesPageResponse, TargetRole } from "@/models/roles"

const scenarios: RolesMockScenario[] = [
  "noRoles",
  "singleRoleWithoutJobDescription",
  "multipleRoles",
  "rolesWithoutCurrent",
  "roleWithJobDescriptionParsing",
  "roleWithJobDescriptionFailed",
  "roleWithParsedJobDescription",
  "profileMissing",
  "profileIncomplete",
  "matchingAnalysisGenerating",
  "matchingAnalysisFailed",
  "matchingAnalysisStale",
  "matchingAnalysisCurrent",
  "archivedRoles",
]

function expectConsistentJobDescription(role: TargetRole) {
  const { jobDescription, jobDescriptionAnalysis } = role

  switch (jobDescription.status) {
    case "missing":
      expect(jobDescription.rawText).toBeNull()
      expect(jobDescription.version).toBeNull()
      expect(jobDescription.parsingFailureReason).toBeNull()
      expect(jobDescriptionAnalysis).toBeNull()
      return
    case "parsing":
      expect(jobDescription.rawText.trim()).not.toBe("")
      expect(jobDescription.version).toBeTypeOf("number")
      expect(jobDescription.parsingFailureReason).toBeNull()
      expect(jobDescriptionAnalysis).toBeNull()
      return
    case "failed":
      expect(jobDescription.rawText.trim()).not.toBe("")
      expect(jobDescription.version).toBeTypeOf("number")
      expect(jobDescription.parsingFailureReason.trim()).not.toBe("")
      expect(jobDescriptionAnalysis).toBeNull()
      return
    case "ready":
      expect(jobDescription.rawText.trim()).not.toBe("")
      expect(jobDescription.version).toBeTypeOf("number")
      expect(jobDescription.parsingFailureReason).toBeNull()
      expect(jobDescriptionAnalysis).not.toBeNull()
      expect(jobDescriptionAnalysis?.jobDescriptionVersion).toBe(jobDescription.version)
      expect(jobDescriptionAnalysis?.analysisVersion).toBeGreaterThanOrEqual(1)
      expect(jobDescriptionAnalysis?.parsedAt).toMatch(/^2026-07-\d{2}T/)
      expect(jobDescriptionAnalysis?.responsibilities).not.toHaveLength(0)
      expect(jobDescriptionAnalysis?.requiredSkills.programmingLanguages).not.toHaveLength(0)
      expect(jobDescriptionAnalysis?.qualificationRequirements.experience).not.toHaveLength(0)
      expect(jobDescriptionAnalysis?.rivaSummary.trim()).not.toBe("")
      expect("frequentKeywords" in (jobDescriptionAnalysis ?? {})).toBe(false)
  }
}

function expectConsistentMatchingAnalysis(response: RolesPageResponse, role: TargetRole) {
  const { matchingAnalysis } = role
  if (!matchingAnalysis) return

  expect(response.profileContext.exists).toBe(true)
  expect(role.jobDescription.status).toBe("ready")
  if (role.jobDescription.status !== "ready" || !response.profileContext.exists) return

  switch (matchingAnalysis.status) {
    case "generating":
      expect(matchingAnalysis.generatedAt).toBeNull()
      expect(matchingAnalysis.failureReason).toBeNull()
      expect(matchingAnalysis.result).toBeNull()
      return
    case "failed":
      expect(matchingAnalysis.generatedAt).toBeNull()
      expect(matchingAnalysis.failureReason.trim()).not.toBe("")
      expect(matchingAnalysis.result).toBeNull()
      return
    case "current":
      expect(matchingAnalysis.profileVersion).toBe(response.profileContext.version)
      expect(matchingAnalysis.jobDescriptionVersion).toBe(role.jobDescription.version)
      expect(matchingAnalysis.jobDescriptionAnalysisVersion).toBe(
        role.jobDescriptionAnalysis?.analysisVersion,
      )
      expect(matchingAnalysis.generatedAt).toMatch(/^2026-07-\d{2}T/)
      expect(matchingAnalysis.result).not.toBeNull()
      expect(matchingAnalysis.result.overallMatchScore).toBeGreaterThanOrEqual(0)
      expect(matchingAnalysis.result.overallMatchScore).toBeLessThanOrEqual(100)
      expect(matchingAnalysis.result.highRiskQuestions).not.toHaveLength(0)
      return
    case "stale":
      expect(
        matchingAnalysis.profileVersion < response.profileContext.version ||
          matchingAnalysis.jobDescriptionVersion < role.jobDescription.version ||
          matchingAnalysis.jobDescriptionAnalysisVersion <
            (role.jobDescriptionAnalysis?.analysisVersion ?? 0),
      ).toBe(true)
      expect(matchingAnalysis.generatedAt).toMatch(/^2026-07-\d{2}T/)
      expect(matchingAnalysis.result).not.toBeNull()
      expect(matchingAnalysis.result.overallMatchScore).toBeGreaterThanOrEqual(0)
      expect(matchingAnalysis.result.overallMatchScore).toBeLessThanOrEqual(100)
      expect(matchingAnalysis.result.highRiskQuestions).not.toHaveLength(0)
  }
}

function expectConsistentRolesResponse(response: RolesPageResponse) {
  const currentRoles = response.roles.filter((role) => role.isCurrent)

  if (response.profileContext.exists) {
    expect(response.profileContext.version).toBeTypeOf("number")
  } else {
    expect(response.profileContext).toEqual({ exists: false, version: null, completed: false })
  }

  expect(currentRoles).toHaveLength(response.currentRoleId ? 1 : 0)
  expect(currentRoles[0]?.id ?? null).toBe(response.currentRoleId)
  if (response.roles.length === 0) expect(response.currentRoleId).toBeNull()

  for (const role of response.roles) {
    expect(role.id).toMatch(/^role_/)
    expect(role.createdAt).toMatch(/^2026-\d{2}-\d{2}T/)
    expect(role.updatedAt).toMatch(/^2026-\d{2}-\d{2}T/)
    expect(Number.isNaN(Date.parse(role.createdAt))).toBe(false)
    expect(Number.isNaN(Date.parse(role.updatedAt))).toBe(false)
    expect(role.preparationStatus === "archived" && role.isCurrent).toBe(false)

    expectConsistentJobDescription(role)
    expectConsistentMatchingAnalysis(response, role)
  }
}

describe("roles mock scenarios", () => {
  it("keeps generated summaries and removed keywords outside the module update contract", () => {
    const analysis = createRolesMockResponse().roles[0]!.jobDescriptionAnalysis!
    expect(analysis.rivaSummary).toBeTruthy()
    expect("frequentKeywords" in analysis).toBe(false)
  })
  it.each(scenarios)("keeps the %s response internally consistent", (scenario) => {
    expectConsistentRolesResponse(createRolesMockResponse(scenario))
  })

  it("does not create matching analysis for roles without one", () => {
    const response = createRolesMockResponse("roleWithParsedJobDescription")

    expect(response.roles[0]?.matchingAnalysis).toBeNull()
  })

  it("keeps paused roles without an automatically promoted current role", () => {
    const response = createRolesMockResponse("rolesWithoutCurrent")
    const activeRoles = response.roles.filter((role) => role.preparationStatus !== "archived")

    expect(activeRoles.length).toBeGreaterThan(0)
    expect(activeRoles.every((role) => role.preparationStatus === "paused")).toBe(true)
    expect(response.currentRoleId).toBeNull()
    expect(response.roles.some((role) => role.isCurrent)).toBe(false)
  })

  it("returns an independent deep copy for each scenario request", () => {
    const first = createRolesMockResponse()
    const second = createRolesMockResponse()
    const firstRole = first.roles[0]!
    const jobDescriptionAnalysis = firstRole.jobDescriptionAnalysis

    if (!jobDescriptionAnalysis) {
      throw new Error("The default roles fixture must include a parsed JD analysis.")
    }

    firstRole.title = "Mutated role title"
    jobDescriptionAnalysis.requiredSkills.programmingLanguages[0] = "Mutated skill"

    expect(second).toEqual(rolesResponseMock)
    expect(second).not.toBe(first)
    expect(second.roles).not.toBe(first.roles)
    expect(second.roles[0]).not.toBe(first.roles[0])
  })
})
