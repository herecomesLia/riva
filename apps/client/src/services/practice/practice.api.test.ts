import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import { i18n } from "@/i18n/i18n"
import type { RolesPageResponseDto, TargetRoleApiDto } from "@/models/roles"
import {
  getPracticePage,
  getQuestionGenerationStatus,
  startPracticeSession,
} from "@/services/practice"

const roleId = "11111111-1111-4111-8111-111111111111"
const archivedRoleId = "66666666-6666-4666-8666-666666666666"
const sessionId = "22222222-2222-4222-8222-222222222222"
const attemptId = "33333333-3333-4333-8333-333333333333"
const questionId = "44444444-4444-4444-8444-444444444444"
const materialId = "55555555-5555-4555-8555-555555555555"

const selection = {
  difficulty: "basic" as const,
  prioritizeWeaknesses: false,
  questionType: "projectDeepDive" as const,
  source: "personalized" as const,
  targetRoleId: roleId,
}

function createRole(
  id: string,
  preparationStatus: TargetRoleApiDto["preparationStatus"] = "paused",
): TargetRoleApiDto {
  return {
    company: "Riva",
    createdAt: "2026-08-10T08:00:00Z",
    experienceRange: { maxYears: 5, minYears: 2 },
    id,
    jobDescription: {
      parsingFailureReason: null,
      rawText: null,
      status: "missing",
      version: null,
    },
    jobDescriptionAnalysis: null,
    location: "Shanghai",
    matchingAnalysis: null,
    preparationStatus,
    recruitmentType: "experienced",
    title: "Frontend Engineer",
    updatedAt: "2026-08-10T09:00:00Z",
    version: 1,
  }
}

function createRolesResponse(): RolesPageResponseDto {
  return {
    currentRoleId: roleId,
    profileContext: { completed: true, exists: true, version: 1 },
    roles: [createRole(roleId), createRole(archivedRoleId, "archived")],
  }
}

function createQuestion() {
  return {
    answerFramework: { content: null, status: "notRequested" as const },
    answerHints: { content: null, status: "notRequested" as const },
    assessedCapabilities: ["问题分析"],
    difficulty: "basic" as const,
    id: questionId,
    isMarkedWeak: false,
    isSaved: false,
    prompt: "请介绍一次你主导的复杂项目。",
    questionType: "projectDeepDive" as const,
    recommendedMaterials: [
      {
        id: materialId,
        label: "结算页性能优化项目",
        reason: "补充项目结果证据。",
        type: "projectExperience" as const,
      },
    ],
    referenceAnswer: {
      content: null,
      status: "notRequested" as const,
      viewedBeforeSubmission: false,
    },
  }
}

function createActiveSession(
  status: "generatingQuestion" | "answering" = "generatingQuestion",
  overrides: Record<string, unknown> = {},
) {
  const base = {
    attemptId,
    attemptNumber: 1,
    language: "en" as const,
    selection,
    sessionId,
    startedAt: "2026-08-11T08:00:00Z",
    version: 1,
    status,
  }
  return status === "answering"
    ? { ...base, question: createQuestion(), ...overrides }
    : { ...base, ...overrides }
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

describe("practice service API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    void i18n.changeLanguage("zh-CN")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads roles and the current session together for setup and refresh recovery", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") return jsonResponse(createRolesResponse())
      if (input === "/api/practice/sessions/current") return jsonResponse({ session: null })
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const page = await getPracticePage()

    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual(
      expect.arrayContaining(["/api/roles", "/api/practice/sessions/current"]),
    )
    expect(page.setupContext).toMatchObject({
      canPrioritizeWeaknesses: false,
      defaultTargetRoleId: roleId,
      eligibleQuestionCounts: { history: 0, saved: 0 },
    })
    expect(page.setupContext.targetRoles).toHaveLength(1)
    expect(page.session).toEqual({
      selection: {
        difficulty: "basic",
        prioritizeWeaknesses: false,
        questionType: "projectDeepDive",
        source: "personalized",
        targetRoleId: roleId,
      },
      status: "setup",
    })
  })

  it.each(["generatingQuestion", "answering"] as const)(
    "adapts an active %s current session without local fixture metadata",
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(createRolesResponse()))
        .mockResolvedValueOnce(jsonResponse({ session: createActiveSession(status) }))

      const page = await getPracticePage()

      expect(page.session).toMatchObject({
        attemptRecords: [],
        language: "en",
        sessionId,
        status,
      })
      if (status === "answering") {
        if (page.session.status !== "answering") throw new Error("Answering session required.")
        expect(page.session.question.recommendedMaterials[0]).toEqual({
          id: materialId,
          label: "结算页性能优化项目",
          reason: "补充项目结果证据。",
          type: "projectExperience",
        })
        expect("templateId" in page.session.question).toBe(false)
      }
    },
  )

  it("starts with exactly the selection body and keeps server language authoritative", async () => {
    const input = { ...selection, prioritizeWeaknesses: true }
    fetchMock.mockResolvedValueOnce(jsonResponse(createActiveSession("generatingQuestion")))

    const session = await startPracticeSession(input)

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/practice/sessions",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual(input)
    expect(requestJson(fetchMock)).not.toHaveProperty("language")
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Accept-Language")).toBe("zh-CN")
    expect(session).toMatchObject({ language: "en", status: "generatingQuestion" })
  })

  it("polls the encoded session refresh endpoint with only the requested version", async () => {
    const response = createActiveSession("answering", { version: 2 })
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const session = await getQuestionGenerationStatus({ sessionId, version: 1 })

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/question-generation/refresh`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 1 })
    expect(session).toMatchObject({ status: "answering", version: 2 })
  })

  it("fails closed when the backend sends a non-contract question payload", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...createActiveSession("answering"),
        question: { ...createQuestion(), templateId: "internal-template" },
      }),
    )

    await expect(getQuestionGenerationStatus({ sessionId, version: 1 })).rejects.toBeInstanceOf(
      ZodError,
    )
  })
})
