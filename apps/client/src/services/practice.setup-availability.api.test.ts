import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getEligiblePracticeQuestionCount,
  reconcilePracticeSetupSelection,
} from "@/models/practice-setup"
import type { TargetRoleApiDto } from "@/models/roles"
import { getPracticePage, preparePracticeTrainingEntry } from "@/services/practice"

const roleAId = "11111111-1111-4111-8111-111111111111"
const roleBId = "22222222-2222-4222-8222-222222222222"
const untrainableRoleId = "33333333-3333-4333-8333-333333333333"
const archivedRoleId = "44444444-4444-4444-8444-444444444444"

function createRole(
  id: string,
  options: { archived?: boolean; trainable?: boolean } = {},
): TargetRoleApiDto {
  const trainable = options.trainable ?? true
  const base = {
    company: "Riva",
    createdAt: "2026-08-20T08:00:00Z",
    experienceRange: { maxYears: 5, minYears: 2 },
    id,
    location: "Shanghai",
    preparationStatus: options.archived ? ("archived" as const) : ("paused" as const),
    recruitmentType: "experienced" as const,
    title: `Role ${id.slice(0, 1)}`,
    updatedAt: "2026-08-20T09:00:00Z",
    version: 1,
  }
  if (!trainable) {
    return {
      ...base,
      jobDescription: {
        parsingFailureReason: null,
        rawText: null,
        status: "missing",
        version: null,
      },
      jobDescriptionAnalysis: null,
      matchingAnalysis: null,
    }
  }
  return {
    ...base,
    jobDescription: {
      parsingFailureReason: null,
      rawText: "Build reliable customer-facing products.",
      status: "ready",
      version: 1,
    },
    jobDescriptionAnalysis: {
      analysisVersion: 1,
      businessDomains: [],
      jobDescriptionVersion: 1,
      parsedAt: "2026-08-20T08:30:00Z",
      preferredQualifications: [],
      qualificationRequirements: {
        certifications: [],
        education: [],
        experience: [],
        graduationCohorts: [],
        languages: [],
        majors: [],
        other: [],
      },
      requiredSkills: {
        conceptsAndMethods: [],
        databasesAndMiddleware: [],
        frameworksAndLibraries: [],
        other: [],
        platforms: [],
        programmingLanguages: [],
        tools: [],
      },
      responsibilities: [],
      rivaSummary: "Build reliable products.",
      softSkills: [],
    },
    matchingAnalysis: {
      failureReason: null,
      generatedAt: "2026-08-20T09:00:00Z",
      jobDescriptionAnalysisVersion: 1,
      jobDescriptionVersion: 1,
      profileVersion: 1,
      result: {
        coreRequirementsSummary: "Strong delivery skills.",
        highRiskQuestions: [],
        matchedCapabilities: [],
        missingCapabilities: [],
        overallMatchScore: 80,
        preparationRecommendations: [],
        resumeGaps: [],
        resumeHighlights: [],
        underrepresentedCapabilities: [],
      },
      status: "current",
    },
  }
}

function rolesResponse(profileCompleted = true) {
  return {
    currentRoleId: roleAId,
    profileContext: { completed: profileCompleted, exists: true, version: 1 },
    roles: [
      createRole(roleAId),
      createRole(roleBId),
      createRole(untrainableRoleId, { trainable: false }),
      createRole(archivedRoleId, { archived: true }),
    ],
  }
}

function setupCapabilitiesResponse() {
  return {
    availability: { status: "available" as const },
    canPrioritizeWeaknesses: false,
    historyQuestionCount: 2,
    questionSourceAvailability: [
      {
        difficulty: "basic",
        historyQuestionCount: 0,
        questionType: "projectDeepDive",
        savedQuestionCount: 1,
        targetRoleId: roleAId,
      },
      {
        difficulty: "pressure",
        historyQuestionCount: 2,
        questionType: "behavioral",
        savedQuestionCount: 0,
        targetRoleId: roleAId,
      },
    ],
    savedQuestionCount: 1,
    trainingAvailableTargetRoleIds: [roleAId, roleBId],
  }
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  })
}

describe("real practice setup selection availability", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") return jsonResponse(rolesResponse())
      if (input === "/api/practice/sessions/current") return jsonResponse({ session: null })
      if (input === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("parses exact counts and only exposes roles with real training prerequisites", async () => {
    const page = await getPracticePage()
    const count = (overrides: {
      targetRoleId: string
      questionType: "projectDeepDive" | "behavioral"
      difficulty: "basic" | "pressure"
      source: "personalized" | "saved" | "history"
    }) => getEligiblePracticeQuestionCount(page.setupContext, overrides)

    expect(page.setupContext.targetRoles.map(({ id }) => id)).toEqual([roleAId, roleBId])
    expect(page.setupContext.questionSourceAvailability).toEqual(
      setupCapabilitiesResponse().questionSourceAvailability,
    )
    expect(
      count({
        targetRoleId: roleAId,
        questionType: "projectDeepDive",
        difficulty: "basic",
        source: "saved",
      }),
    ).toBe(1)
    expect(
      count({
        targetRoleId: roleBId,
        questionType: "projectDeepDive",
        difficulty: "basic",
        source: "saved",
      }),
    ).toBe(0)
    expect(
      count({
        targetRoleId: roleAId,
        questionType: "projectDeepDive",
        difficulty: "pressure",
        source: "saved",
      }),
    ).toBe(0)
    expect(
      count({
        targetRoleId: roleAId,
        questionType: "projectDeepDive",
        difficulty: "pressure",
        source: "history",
      }),
    ).toBe(0)
    expect(
      count({
        targetRoleId: roleBId,
        questionType: "behavioral",
        difficulty: "pressure",
        source: "personalized",
      }),
    ).toBe(1)
  })

  it("does not expose real setup roles when the profile prerequisite is unavailable", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") return jsonResponse(rolesResponse(false))
      if (input === "/api/practice/sessions/current") return jsonResponse({ session: null })
      if (input === "/api/practice/setup") {
        return jsonResponse({
          ...setupCapabilitiesResponse(),
          availability: { status: "blocked", reason: "profileIncomplete" },
          trainingAvailableTargetRoleIds: [],
        })
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    expect((await getPracticePage()).setupContext.targetRoles).toEqual([])
  })

  it("does not restore a history source that is unavailable for the exact selection", async () => {
    const prepared = await preparePracticeTrainingEntry({
      difficulty: "basic",
      entry: "history",
      questionType: "projectDeepDive",
      source: "history",
      targetRoleId: roleAId,
    })

    expect(prepared.resolution).toMatchObject({
      adjustments: ["questionSourceUnavailable"],
      configuration: { source: "personalized" },
      status: "adjusted",
    })
    expect(
      reconcilePracticeSetupSelection(prepared.page.setupContext, {
        ...prepared.resolution.configuration,
        source: "history",
      }).source,
    ).toBe("personalized")
  })
})
