import { describe, expect, it } from "vitest"

import {
  createRolesMockResponse,
  rolesResponseMock,
  type RolesMockScenario,
} from "@/mocks/data/roles"
import {
  createJobDescriptionAnalysisFixture,
  createMatchingAnalysisResultFixture,
  derivePracticeSupportedQuestionTypes,
} from "@/mocks/data/role-fixture-builders"
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
  if (response.profileContext.exists) {
    expect(response.profileContext.version).toBeTypeOf("number")
  } else {
    expect(response.profileContext).toEqual({ exists: false, version: null, completed: false })
  }

  if (response.roles.length === 0) expect(response.currentRoleId).toBeNull()
  if (response.currentRoleId !== null) {
    const currentRole = response.roles.find((role) => role.id === response.currentRoleId)
    expect(currentRole).toBeDefined()
    expect(currentRole?.preparationStatus).not.toBe("archived")
  }

  for (const role of response.roles) {
    expect(role.id).toMatch(/^role_/)
    expect(role.createdAt).toMatch(/^2026-\d{2}-\d{2}T/)
    expect(role.updatedAt).toMatch(/^2026-\d{2}-\d{2}T/)
    expect(Number.isNaN(Date.parse(role.createdAt))).toBe(false)
    expect(Number.isNaN(Date.parse(role.updatedAt))).toBe(false)
    expect("isCurrent" in role).toBe(false)

    expectConsistentJobDescription(role)
    expectConsistentMatchingAnalysis(response, role)
  }
}

describe("roles mock scenarios", () => {
  it.each([
    ["Senior Frontend Engineer", true],
    ["前端平台工程师", true],
    ["Product Manager", false],
    ["Business Operations Manager", false],
  ])("derives practice question types from the role title %s", (title, supportsTechnical) => {
    const questionTypes = derivePracticeSupportedQuestionTypes({ title })

    expect(questionTypes).toContain("projectDeepDive")
    expect(questionTypes.includes("technicalFoundation")).toBe(supportsTechnical)
  })

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
  })

  it("returns independent mutable data from the shared fixture builders", () => {
    const firstAnalysis = createJobDescriptionAnalysisFixture({
      jobDescriptionVersion: 4,
      parsedAt: "2026-07-14T08:45:00.000Z",
    })
    const secondAnalysis = createJobDescriptionAnalysisFixture({
      jobDescriptionVersion: 4,
      parsedAt: "2026-07-14T08:45:00.000Z",
    })
    const firstResult = createMatchingAnalysisResultFixture()
    const secondResult = createMatchingAnalysisResultFixture()

    expect(firstAnalysis).not.toBe(secondAnalysis)
    expect(firstAnalysis.responsibilities).not.toBe(secondAnalysis.responsibilities)
    expect(firstAnalysis.requiredSkills.programmingLanguages).not.toBe(
      secondAnalysis.requiredSkills.programmingLanguages,
    )
    expect(firstResult).not.toBe(secondResult)
    expect(firstResult.highRiskQuestions).not.toBe(secondResult.highRiskQuestions)

    firstAnalysis.responsibilities[0] = "Mutated responsibility"
    firstAnalysis.requiredSkills.programmingLanguages[0] = "Mutated language"
    firstResult.highRiskQuestions[0] = "Mutated question"

    expect(secondAnalysis.responsibilities[0]).not.toBe("Mutated responsibility")
    expect(secondAnalysis.requiredSkills.programmingLanguages[0]).not.toBe("Mutated language")
    expect(secondResult.highRiskQuestions[0]).not.toBe("Mutated question")
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
