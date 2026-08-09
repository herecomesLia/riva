import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import type {
  MatchingAnalysis,
  MatchingAnalysisResult,
  RolesPageResponseDto,
  TargetRoleApiDto,
} from "@/models/roles"
import { ApiError } from "@/services/api"
import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  generateMatchingAnalysis,
  getJobDescriptionParsingStatus,
  getMatchingAnalysisStatus,
  getRolesPage,
  saveJobDescription,
  setCurrentTargetRole,
  startJobDescriptionParsing,
  updateJobDescriptionAnalysisModule,
  updateRolePreparationStatus,
  updateTargetRole,
  rolesCapabilities,
} from "@/services/roles"

const roleId = "11111111-1111-4111-8111-111111111111"

function createResponse(status: "missing" | "saved" = "missing"): RolesPageResponseDto {
  const roleBase = {
    company: "Riva",
    createdAt: "2026-07-30T08:00:00Z",
    experienceRange: { maxYears: 5, minYears: 2 },
    id: roleId,
    location: "Shanghai",
    matchingAnalysis: null,
    preparationStatus: "paused" as const,
    recruitmentType: "experienced" as const,
    title: "Backend Engineer",
    updatedAt: "2026-07-30T09:00:00Z",
    version: 3,
  }
  const role =
    status === "saved"
      ? {
          ...roleBase,
          jobDescription: {
            parsingFailureReason: null,
            rawText: "Build reliable APIs.",
            status: "saved" as const,
            version: 2,
          },
          jobDescriptionAnalysis: null,
        }
      : {
          ...roleBase,
          jobDescription: {
            parsingFailureReason: null,
            rawText: null,
            status: "missing" as const,
            version: null,
          },
          jobDescriptionAnalysis: null,
        }

  return {
    currentRoleId: roleId,
    profileContext: { completed: true, exists: true, version: 4 },
    roles: [role],
  }
}

function createMatchingAnalysis(status: MatchingAnalysis["status"]): MatchingAnalysis {
  const context = {
    jobDescriptionAnalysisVersion: 1,
    jobDescriptionVersion: 2,
    profileVersion: 4,
  }
  const result: MatchingAnalysisResult = {
    coreRequirementsSummary: "Strong API delivery experience.",
    highRiskQuestions: ["How do you handle API failures?"],
    matchedCapabilities: ["API design"],
    missingCapabilities: ["Large-scale experimentation"],
    overallMatchScore: 78,
    preparationRecommendations: ["Prepare a production incident example."],
    resumeGaps: ["Add measurable reliability outcomes."],
    resumeHighlights: ["Improved service reliability."],
    underrepresentedCapabilities: ["Cross-functional leadership"],
  }

  if (status === "generating") {
    return { ...context, failureReason: null, generatedAt: null, result: null, status }
  }
  if (status === "failed") {
    return {
      ...context,
      failureReason: "Matching analysis failed.",
      generatedAt: null,
      result: null,
      status,
    }
  }
  return {
    ...context,
    failureReason: null,
    generatedAt: "2026-07-30T09:30:00Z",
    result,
    status,
  }
}

function createReadyRole(
  matchingAnalysis: TargetRoleApiDto["matchingAnalysis"] = null,
): TargetRoleApiDto {
  return {
    company: "Riva",
    createdAt: "2026-07-30T08:00:00Z",
    experienceRange: { maxYears: 5, minYears: 2 },
    id: roleId,
    jobDescription: {
      parsingFailureReason: null,
      rawText: "Build reliable APIs.",
      status: "ready",
      version: 2,
    },
    jobDescriptionAnalysis: {
      analysisVersion: 1,
      businessDomains: ["Developer infrastructure"],
      jobDescriptionVersion: 2,
      parsedAt: "2026-07-30T08:30:00Z",
      preferredQualifications: ["Experience with distributed systems."],
      qualificationRequirements: {
        certifications: [],
        education: ["Bachelor's degree"],
        experience: ["Three years of backend experience."],
        graduationCohorts: [],
        languages: [],
        majors: ["Computer science"],
        other: [],
      },
      requiredSkills: {
        conceptsAndMethods: ["API design"],
        databasesAndMiddleware: ["PostgreSQL"],
        frameworksAndLibraries: ["FastAPI"],
        other: [],
        platforms: [],
        programmingLanguages: ["Python"],
        tools: [],
      },
      responsibilities: ["Build reliable APIs."],
      rivaSummary: "Build reliable APIs for developer infrastructure.",
      softSkills: ["Collaboration"],
    },
    location: "Shanghai",
    matchingAnalysis,
    preparationStatus: "paused",
    recruitmentType: "experienced",
    title: "Backend Engineer",
    updatedAt: "2026-07-30T09:00:00Z",
    version: 3,
  }
}

function createReadyResponse(
  matchingAnalysis: TargetRoleApiDto["matchingAnalysis"] = null,
): RolesPageResponseDto {
  return {
    currentRoleId: roleId,
    profileContext: { completed: true, exists: true, version: 4 },
    roles: [createReadyRole(matchingAnalysis)],
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function requestJson(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  const body = fetchMock.mock.calls[index]?.[1]?.body
  if (typeof body !== "string") throw new TypeError("Expected a JSON request body.")
  return JSON.parse(body) as unknown
}

describe("roles service API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("enables JD and matching analysis capabilities for the real API", () => {
    expect(rolesCapabilities).toEqual({
      jobDescriptionAnalysis: true,
      matchingAnalysis: true,
    })
  })

  it.each(["missing", "saved"] as const)(
    "maps a %s JD without inventing analysis",
    async (status) => {
      const response = createResponse(status)
      fetchMock.mockResolvedValueOnce(jsonResponse(response))

      const result = await getRolesPage()

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/roles",
        expect.objectContaining({ credentials: "include" }),
      )
      expect(result).toEqual(response)
      expect(result.roles[0]).toMatchObject({
        jobDescription: { status },
        jobDescriptionAnalysis: null,
        matchingAnalysis: null,
        preparationStatus: "paused",
      })
    },
  )

  it.each(["generating", "current", "stale", "failed"] as const)(
    "accepts a complete %s matching-analysis response",
    async (status) => {
      const response = createReadyResponse(createMatchingAnalysis(status))
      fetchMock.mockResolvedValueOnce(jsonResponse(response))

      const result = await getRolesPage()

      expect(result).toEqual(response)
      expect(result.roles[0]?.jobDescriptionAnalysis).toMatchObject({
        analysisVersion: 1,
        jobDescriptionVersion: 2,
      })
      expect(result.roles[0]?.matchingAnalysis?.status).toBe(status)
    },
  )

  it("uses POST /roles and the server camelCase create body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createResponse(), 201))
    const input = {
      company: "Riva",
      experienceRange: { maxYears: 5, minYears: 2 },
      location: "Shanghai",
      preparationStatus: "preparing" as const,
      recruitmentType: "experienced" as const,
      title: "Backend Engineer",
    }

    await createTargetRole(input)

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/roles")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(requestJson(fetchMock)).toEqual(input)
  })

  it("uses PATCH /roles/{roleId} without putting roleId in the body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createResponse()))

    await updateTargetRole({
      company: null,
      experienceRange: null,
      location: null,
      recruitmentType: null,
      roleId,
      title: "Platform Engineer",
      version: 3,
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/roles/${roleId}`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH")
    expect(requestJson(fetchMock)).toEqual({
      company: null,
      experienceRange: null,
      location: null,
      recruitmentType: null,
      title: "Platform Engineer",
      version: 3,
    })
  })

  it.each([
    {
      call: () => setCurrentTargetRole({ roleId, version: 3 }),
      body: { version: 3 },
      method: "PUT",
      path: `/api/roles/${roleId}/current`,
    },
    {
      call: () =>
        updateRolePreparationStatus({
          preparationStatus: "paused",
          roleId,
          version: 3,
        }),
      body: { preparationStatus: "paused", version: 3 },
      method: "PATCH",
      path: `/api/roles/${roleId}/preparation-status`,
    },
    {
      call: () => archiveTargetRole({ roleId, version: 3 }),
      body: { version: 3 },
      method: "POST",
      path: `/api/roles/${roleId}/archive`,
    },
    {
      call: () =>
        saveJobDescription({
          rawText: "Build reliable APIs.",
          roleId,
          version: 3,
        }),
      body: { rawText: "Build reliable APIs.", version: 3 },
      method: "PUT",
      path: `/api/roles/${roleId}/job-description`,
    },
  ])("uses $method $path with the exact mutation body", async ({ body, call, method, path }) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createResponse("saved")))

    await call()

    expect(fetchMock.mock.calls[0]?.[0]).toBe(path)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe(method)
    expect(requestJson(fetchMock)).toEqual(body)
  })

  it("starts JD parsing with the exact request body and validates the page response", async () => {
    const response = createResponse("saved")
    fetchMock.mockResolvedValueOnce(jsonResponse(response, 202))

    const result = await startJobDescriptionParsing({
      jobDescriptionVersion: 2,
      roleId,
      version: 3,
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/roles/${roleId}/job-description/parsing`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST")
    expect(requestJson(fetchMock)).toEqual({ version: 3, jobDescriptionVersion: 2 })
    expect(result).toEqual(response)
  })

  it("gets JD parsing status with encoded roleId, encoded query parameters, and no body", async () => {
    const response = createReadyRole()
    const operationRoleId = "role/with spaces"
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const result = await getJobDescriptionParsingStatus({
      jobDescriptionVersion: 2,
      roleId: operationRoleId,
      version: 3,
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/roles/${encodeURIComponent(operationRoleId)}/job-description/parsing?version=3&jobDescriptionVersion=2`,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: undefined,
      credentials: "include",
    })
    expect(result).toEqual(response)
  })

  it("updates a JD analysis module without putting roleId in the body", async () => {
    const response = createReadyResponse()
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const result = await updateJobDescriptionAnalysisModule({
      analysisVersion: 1,
      field: "responsibilities",
      jobDescriptionVersion: 2,
      roleId,
      value: ["Build reliable APIs.", "Review API design decisions."],
      version: 3,
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/roles/${roleId}/job-description/analysis`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH")
    expect(requestJson(fetchMock)).toEqual({
      analysisVersion: 1,
      field: "responsibilities",
      jobDescriptionVersion: 2,
      value: ["Build reliable APIs.", "Review API design decisions."],
      version: 3,
    })
    expect(result).toEqual(response)
  })

  it("starts matching analysis with only the role version in the request body", async () => {
    const response = createReadyResponse(createMatchingAnalysis("generating"))
    fetchMock.mockResolvedValueOnce(jsonResponse(response, 202))

    const result = await generateMatchingAnalysis({ roleId, version: 3 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/roles/${roleId}/matching-analysis`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST")
    expect(requestJson(fetchMock)).toEqual({ version: 3 })
    expect(result).toEqual(response)
  })

  it("gets matching analysis status with an encoded roleId and no body", async () => {
    const response = createReadyRole(createMatchingAnalysis("generating"))
    const operationRoleId = "role/with spaces"
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const result = await getMatchingAnalysisStatus({ roleId: operationRoleId, version: 3 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/roles/${encodeURIComponent(operationRoleId)}/matching-analysis?version=3`,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: undefined,
      credentials: "include",
    })
    expect(result).toEqual(response)
  })

  it("rejects an invalid single-role polling response", async () => {
    const response = createReadyRole()
    response.jobDescriptionAnalysis = null
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    await expect(
      getJobDescriptionParsingStatus({
        jobDescriptionVersion: 2,
        roleId,
        version: 3,
      }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it("sends DELETE version in the query and no JSON body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createResponse()))

    await deleteTargetRole({ roleId, version: 3 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/roles/${roleId}?version=3`)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: undefined,
      credentials: "include",
      method: "DELETE",
    })
  })

  it.each([
    [404, "target_role_not_found"],
    [409, "target_role_version_conflict"],
    [409, "target_role_state_conflict"],
    [422, "validation_error"],
    [401, "not_authenticated"],
  ] as const)("preserves %i %s as a structured ApiError", async (status, code) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: code }, status))

    const error = await setCurrentTargetRole({ roleId, version: 3 }).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ body: { error: code }, code, status })
  })

  it("rejects invalid role responses", async () => {
    const response = createResponse()
    response.roles[0]!.id = "role_with_prefix"
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    await expect(getRolesPage()).rejects.toBeInstanceOf(ZodError)
  })

  it("rejects archived current roles", async () => {
    const response = createResponse()
    response.roles[0]!.preparationStatus = "archived"
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    await expect(getRolesPage()).rejects.toBeInstanceOf(ZodError)
  })

  it("retains archived roles when there is no current role", async () => {
    const response = createResponse()
    response.currentRoleId = null
    response.roles[0]!.preparationStatus = "archived"
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    await expect(getRolesPage()).resolves.toMatchObject({
      currentRoleId: null,
      roles: [{ id: roleId, preparationStatus: "archived" }],
    })
  })
})
