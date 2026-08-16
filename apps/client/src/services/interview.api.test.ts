import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { InterviewPageResponse } from "@/models/interview"
import {
  beginInterviewQuestions,
  getInterviewPage,
  retryInterviewTurn,
  startInterview,
  submitInterviewAnswer,
} from "@/services/interview"

const roleId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"

function response(session: NonNullable<InterviewPageResponse["session"]>): InterviewPageResponse {
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
})
