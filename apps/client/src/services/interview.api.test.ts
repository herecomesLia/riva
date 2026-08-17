import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { InterviewPageResponse } from "@/models/interview"
import {
  beginInterviewQuestions,
  endInterview,
  finishInterview,
  getInterviewReview,
  getInterviewPage,
  retryInterviewCandidateAnswer,
  retryInterviewReview,
  retryInterviewTurn,
  prepareInterviewTrainingEntry,
  submitCandidateQuestion,
  startInterview,
  submitInterviewAnswer,
} from "@/services/interview"

const roleId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"

function trainableRole(overrides: Record<string, unknown> = {}) {
  return {
    id: roleId,
    title: "Backend Engineer",
    company: "Riva",
    recruitmentType: "experienced",
    location: "Shanghai",
    experienceRange: { minYears: 2, maxYears: 5 },
    preparationStatus: "paused",
    createdAt: "2026-08-10T08:00:00Z",
    updatedAt: "2026-08-10T09:00:00Z",
    version: 1,
    matchingAnalysis: null,
    jobDescription: {
      status: "ready",
      rawText: "Build reliable customer-facing products.",
      version: 1,
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: {
      jobDescriptionVersion: 1,
      analysisVersion: 1,
      parsedAt: "2026-08-10T09:30:00Z",
      rivaSummary: "Build reliable products.",
      responsibilities: [],
      qualificationRequirements: {
        education: [],
        graduationCohorts: [],
        majors: [],
        experience: [],
        languages: [],
        certifications: [],
        other: [],
      },
      requiredSkills: {
        programmingLanguages: [],
        frameworksAndLibraries: [],
        platforms: [],
        tools: [],
        conceptsAndMethods: [],
        databasesAndMiddleware: [],
        other: [],
      },
      preferredQualifications: [],
      softSkills: [],
      businessDomains: [],
    },
    ...overrides,
  }
}

function rolesPage(
  roles: unknown[] = [trainableRole()],
  profileContext: Record<string, unknown> = { exists: true, version: 1, completed: true },
  currentRoleId: string | null = roleId,
) {
  return { roles, currentRoleId, profileContext }
}

function response(session: InterviewPageResponse["session"]): InterviewPageResponse {
  return {
    setup: {
      availability: { status: "available" },
      targetRoles: [
        {
          id: roleId,
          title: "Backend Engineer",
          company: "Riva",
          supportedRounds: ["technical"],
        },
      ],
      availableDifficulties: ["basic", "pressure"],
      availableDurationMinutes: [15, 30, 45],
      defaultConfiguration: {
        targetRoleId: roleId,
        round: "technical",
        difficulty: "pressure",
        durationMinutes: 30,
      },
    },
    session,
  }
}

function opening(): InterviewPageResponse {
  return response({
    status: "opening",
    sessionId,
    language: "en",
    version: 1,
    configuration: {
      targetRoleId: roleId,
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 30,
    },
    startedAt: "2026-08-16T02:00:00.000Z",
    progress: { completedMainQuestions: 0, totalMainQuestions: null, planRevision: 0 },
    completedQuestions: [],
    openingMessage: "Welcome to the interview.",
  })
}

function generation(): InterviewPageResponse {
  const session = opening().session
  if (session === null || session.status !== "opening") {
    throw new Error("Expected opening fixture")
  }
  return response({
    sessionId: session.sessionId,
    language: session.language,
    version: 2,
    configuration: session.configuration,
    startedAt: session.startedAt,
    progress: session.progress,
    completedQuestions: [],
    status: "generatingQuestion",
    generationStatus: "generating",
  })
}

function requestJson(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const body = fetchMock.mock.calls[0]?.[1]?.body
  if (typeof body !== "string") throw new TypeError("Expected JSON body")
  return JSON.parse(body) as unknown
}

describe("interview service API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("gets the real interview page", async () => {
    const page = opening()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 200 }))

    await expect(getInterviewPage()).resolves.toEqual(page)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/interview",
      expect.objectContaining({ credentials: "include" }),
    )
  })

  it("starts a real interview with the configuration body", async () => {
    const page = opening()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 201 }))
    const input = {
      targetRoleId: roleId,
      round: "technical" as const,
      difficulty: "pressure" as const,
      durationMinutes: 30 as const,
    }

    await startInterview(input)

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/interview/sessions")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(requestJson(fetchMock)).toEqual(input)
  })

  it("begins questions with only the current version", async () => {
    const page = generation()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 202 }))

    await beginInterviewQuestions({ sessionId, version: 1 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/interview/sessions/${sessionId}/questions/begin`,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(requestJson(fetchMock)).toEqual({ version: 1 })
  })

  it("submits a main answer through the real endpoint", async () => {
    const page = generation()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 202 }))

    await submitInterviewAnswer({
      sessionId,
      version: 3,
      target: "question",
      questionId: "33333333-3333-4333-8333-333333333333",
      content: "A concrete answer.",
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/interview/sessions/${sessionId}/answers`)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(requestJson(fetchMock)).toEqual({
      version: 3,
      target: "question",
      questionId: "33333333-3333-4333-8333-333333333333",
      content: "A concrete answer.",
    })
  })

  it("submits a follow-up answer with its parent question lineage", async () => {
    const page = generation()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 202 }))

    await submitInterviewAnswer({
      sessionId,
      version: 5,
      target: "followUp",
      questionId: "33333333-3333-4333-8333-333333333333",
      followUpQuestionId: "44444444-4444-4444-8444-444444444444",
      content: "A concrete follow-up answer.",
    })

    expect(requestJson(fetchMock)).toEqual({
      version: 5,
      target: "followUp",
      questionId: "33333333-3333-4333-8333-333333333333",
      followUpQuestionId: "44444444-4444-4444-8444-444444444444",
      content: "A concrete follow-up answer.",
    })
  })

  it("retries a failed turn with the authoritative version", async () => {
    const page = generation()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 202 }))

    await retryInterviewTurn({ sessionId, version: 4 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/interview/sessions/${sessionId}/turn/retry`)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(requestJson(fetchMock)).toEqual({ version: 4 })
  })

  it("submits candidate questions through the real endpoint", async () => {
    const page = generation()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 202 }))

    await submitCandidateQuestion({
      sessionId,
      version: 7,
      content: "How does the team define success in the first six months?",
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/interview/sessions/${sessionId}/candidate-questions`,
    )
    expect(requestJson(fetchMock)).toEqual({
      version: 7,
      content: "How does the team define success in the first six months?",
    })
  })

  it.each([
    ["finish", finishInterview, `/api/interview/sessions/${sessionId}/finish`],
    ["end", endInterview, `/api/interview/sessions/${sessionId}/end`],
    [
      "candidate answer retry",
      retryInterviewCandidateAnswer,
      `/api/interview/sessions/${sessionId}/candidate-answer/retry`,
    ],
    ["review retry", retryInterviewReview, `/api/interview/sessions/${sessionId}/review/retry`],
  ] as const)("calls the real %s endpoint", async (_name, service, path) => {
    const page = generation()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 202 }))

    await service({ sessionId, version: 10 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(path)
    expect(requestJson(fetchMock)).toEqual({ version: 10 })
  })

  it("gets a completed review through the real endpoint", async () => {
    const review = {
      sessionId,
      completionReason: "userEndedEarly" as const,
      status: "unavailable" as const,
      reason: "insufficientAnswers" as const,
      questionDetails: [],
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(review), { status: 200 }))

    await expect(getInterviewReview({ sessionId })).resolves.toEqual(review)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/interview/sessions/${sessionId}/review`)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" })
  })

  it("prepares a real history entry from current roles and interview setup", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") return new Response(JSON.stringify(rolesPage()))
      if (input === "/api/interview") return new Response(JSON.stringify(response(null)))
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const prepared = await prepareInterviewTrainingEntry({
      targetRoleId: roleId,
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 45,
    })

    expect(prepared.page.session).toBeNull()
    expect(prepared.resolution).toEqual({
      status: "available",
      configuration: {
        targetRoleId: roleId,
        round: "technical",
        difficulty: "pressure",
        durationMinutes: 45,
      },
      adjustments: [],
    })
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual(
      expect.arrayContaining(["/api/roles", "/api/interview"]),
    )
  })

  it("adjusts unsupported history settings and reports unavailable roles", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") return new Response(JSON.stringify(rolesPage()))
      if (input === "/api/interview") return new Response(JSON.stringify(response(null)))
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const adjusted = await prepareInterviewTrainingEntry({
      targetRoleId: roleId,
      round: "hr",
      difficulty: "basic",
      durationMinutes: 15,
    })
    expect(adjusted.resolution).toMatchObject({
      status: "adjusted",
      adjustments: ["interviewRoundUnsupported"],
      configuration: { targetRoleId: roleId, round: "technical" },
    })

    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") {
        return new Response(
          JSON.stringify(
            rolesPage([trainableRole({ preparationStatus: "archived" })], undefined, null),
          ),
        )
      }
      if (input === "/api/interview") return new Response(JSON.stringify(response(null)))
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const unavailable = await prepareInterviewTrainingEntry({ targetRoleId: roleId })
    expect(unavailable.resolution).toMatchObject({
      status: "roleUnavailable",
      reason: "targetRoleArchived",
      configuration: { targetRoleId: null },
    })
  })

  it("rejects history preparation while a real interview is active", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") return new Response(JSON.stringify(rolesPage()))
      if (input === "/api/interview") return new Response(JSON.stringify(opening()))
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    await expect(prepareInterviewTrainingEntry({ targetRoleId: roleId })).rejects.toThrow(
      "interview session is active",
    )
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
  })
})
