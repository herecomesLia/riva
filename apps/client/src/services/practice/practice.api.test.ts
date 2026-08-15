import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import { i18n } from "@/i18n/i18n"
import type { PracticeActiveSessionState, PracticeServiceResponse } from "@/models/practice"
import type { RolesPageResponseDto, TargetRoleApiDto } from "@/models/roles"
import {
  getFollowUpGenerationStatus,
  getPracticeFollowUpReferenceAnswerStatus,
  getPracticeReferenceAnswerStatus,
  getPracticeEvaluationStatus,
  getPracticePage,
  getQuestionGenerationStatus,
  continueToNextPracticeQuestion,
  endPracticeFollowUps,
  endPracticeSession,
  requestEndPracticeSession,
  prepareNextPracticeSession,
  preparePracticeTrainingEntry,
  requestAnswerFramework,
  retryCurrentPracticeQuestion,
  requestPracticeFollowUpFramework,
  requestPracticeFollowUpHint,
  requestPracticeFollowUpReferenceAnswer,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
  setQuestionSaved,
  setQuestionWeak,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
} from "@/services/practice"

const roleId = "11111111-1111-4111-8111-111111111111"
const archivedRoleId = "66666666-6666-4666-8666-666666666666"
const sessionId = "22222222-2222-4222-8222-222222222222"
const attemptId = "33333333-3333-4333-8333-333333333333"
const questionId = "44444444-4444-4444-8444-444444444444"
const materialId = "55555555-5555-4555-8555-555555555555"
const followUpQuestionId = "77777777-7777-4777-8777-777777777777"
const secondFollowUpQuestionId = "88888888-8888-4888-8888-888888888888"
const answerId = "99999999-9999-4999-8999-999999999999"
const secondAnswerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

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

function createTrainableRole(
  id: string,
  preparationStatus: TargetRoleApiDto["preparationStatus"] = "paused",
  title = "Frontend Engineer",
): TargetRoleApiDto {
  return {
    ...createRole(id, preparationStatus),
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
      parsedAt: "2026-08-10T09:30:00Z",
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
      generatedAt: "2026-08-10T10:00:00Z",
      jobDescriptionAnalysisVersion: 1,
      jobDescriptionVersion: 1,
      profileVersion: 1,
      result: {
        coreRequirementsSummary: "Strong product delivery skills.",
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
    title,
  }
}

function createTrainableRolesResponse(
  roles: TargetRoleApiDto[] = [
    createTrainableRole(roleId),
    createTrainableRole(archivedRoleId, "archived"),
  ],
): RolesPageResponseDto {
  return {
    currentRoleId: roleId,
    profileContext: { completed: true, exists: true, version: 1 },
    roles,
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

function createCompletedSession(overrides: Record<string, unknown> = {}) {
  return {
    attemptId,
    attemptNumber: 1,
    completedAt: "2026-08-11T08:05:00.000Z",
    completionReason: "reviewCompleted" as const,
    finalAttemptAverageScore: 82,
    language: "en" as const,
    markedWeakQuestionCount: 0,
    nextStepSuggestion: "Move to the next focused question.",
    questionsCompleted: 1,
    retryCount: 0,
    savedQuestionCount: 0,
    selection,
    sessionId,
    startedAt: "2026-08-11T08:00:00.000Z",
    status: "completed" as const,
    unfinishedAttempt: null,
    version: 6,
    ...overrides,
  }
}

function createAnswer(id: string, order: number) {
  return {
    id,
    content: order === 1 ? "主回答内容" : `追问回答 ${order - 1}`,
    createdAt: "2026-08-11T08:01:00.000Z",
    order,
  }
}

function createFollowUpQuestion(id: string, order: number) {
  return {
    answerFramework: { content: null, status: "notRequested" as const },
    answerHints: { content: null, status: "notRequested" as const },
    createdAt: "2026-08-11T08:01:00.000Z",
    id,
    order,
    prompt: `请补充追问 ${order}。`,
    referenceAnswer: {
      content: null,
      status: "notRequested" as const,
      viewedBeforeSubmission: false,
    },
  }
}

function createFollowUpExchange(order = 1) {
  return {
    answer: createAnswer(order === 1 ? answerId : secondAnswerId, order + 1),
    question: createFollowUpQuestion(
      order === 1 ? followUpQuestionId : secondFollowUpQuestionId,
      order,
    ),
    status: "answered" as const,
  }
}

function createFollowUpSession(
  status: "generatingFollowUp" | "answeringFollowUp" | "evaluating" | "review",
  overrides: Record<string, unknown> = {},
) {
  const base = createActiveSession("answering", { version: 3 })
  const exchange = createFollowUpExchange()
  const common = {
    ...base,
    mainAnswer: createAnswer(answerId, 1),
    question: createQuestion(),
    status,
    followUpExchanges: status === "generatingFollowUp" ? [] : [exchange],
    ...overrides,
  }
  if (status === "generatingFollowUp") return common
  if (status === "answeringFollowUp") {
    return {
      ...common,
      followUpExchanges: overrides.followUpExchanges ?? [],
      currentFollowUp: {
        answer: null,
        question: createFollowUpQuestion(followUpQuestionId, 1),
        status: "awaitingAnswer" as const,
      },
    }
  }
  const evaluation = {
    dimensionScores: [
      {
        dimension: "relevance" as const,
        explanation: "与问题相关。",
        score: 80,
      },
      {
        dimension: "structure" as const,
        explanation: "结构清晰。",
        score: 80,
      },
      {
        dimension: "specificity" as const,
        explanation: "细节充分。",
        score: 80,
      },
      {
        dimension: "personalContribution" as const,
        explanation: "个人贡献明确。",
        score: 80,
      },
    ],
    evaluatedAt: "2026-08-11T08:02:00.000Z",
    overallScore: 80,
  }
  const review = {
    exposedWeaknesses: [],
    highlights: ["表达清晰"],
    improvementSuggestions: ["补充证据"],
    mainIssues: [],
    overallPerformance: "表现稳定。",
    recommendation: { action: "retryCurrent" as const, reason: "继续打磨。" },
    reusableAnswerStructure: ["背景、行动、结果"],
  }
  return status === "evaluating"
    ? {
        ...common,
        followUpCompletion: { reason: "allAnswered" as const, status: "completed" as const },
        submittedAt: "2026-08-11T08:02:00.000Z",
        ...overrides,
      }
    : {
        ...common,
        evaluation,
        followUpCompletion: { reason: "allAnswered" as const, status: "completed" as const },
        review,
        ...overrides,
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

function requireActiveSession(response: PracticeServiceResponse): PracticeActiveSessionState {
  if ("status" in response && response.status !== "completed") return response
  throw new Error("The real practice API must return an active session.")
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

  it.each(["generatingFollowUp", "answeringFollowUp", "evaluating", "review"] as const)(
    "restores a real %s current session",
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(createRolesResponse()))
        .mockResolvedValueOnce(jsonResponse({ session: createFollowUpSession(status) }))

      const page = await getPracticePage()

      expect(page.session).toMatchObject({ attemptRecords: [], status })
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

  it("ends a review through the real complete endpoint with only the version", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createCompletedSession()))

    const session = await endPracticeSession({ sessionId, version: 5 })

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/complete`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 5 })
    expect(session).toMatchObject({
      attemptRecords: [],
      completionReason: "reviewCompleted",
      finalAttemptAverageScore: 82,
      nextStepSuggestion: "Move to the next focused question.",
      status: "completed",
      unfinishedAttempt: null,
      version: 6,
    })
  })

  it("ends an unanswered question through the real end endpoint with only version and question", async () => {
    const unfinishedQuestion = createQuestion()
    const earlyCompleted = createCompletedSession({
      attemptNumber: 1,
      completionReason: "userEndedEarly",
      finalAttemptAverageScore: 0,
      markedWeakQuestionCount: 0,
      nextStepSuggestion: null,
      questionsCompleted: 0,
      retryCount: 0,
      savedQuestionCount: 0,
      unfinishedAttempt: {
        attemptId,
        attemptNumber: 1,
        question: unfinishedQuestion,
        selection,
      },
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(earlyCompleted))

    const session = await requestEndPracticeSession({
      questionId,
      sessionId,
      version: 5,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/end`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 5, questionId })
    expect(session).toMatchObject({
      attemptId,
      completionReason: "userEndedEarly",
      nextStepSuggestion: null,
      questionsCompleted: 0,
      status: "completed",
      unfinishedAttempt: {
        attemptId,
        attemptNumber: 1,
        question: { id: questionId },
      },
      version: 6,
    })
  })

  it("prepares the next real round by validating completion then loading current setup", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === `/api/practice/sessions/${encodeURIComponent(sessionId)}`) {
        return jsonResponse(createCompletedSession())
      }
      if (input === "/api/roles") return jsonResponse(createRolesResponse())
      if (input === "/api/practice/sessions/current") return jsonResponse({ session: null })
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const page = await prepareNextPracticeSession({ sessionId, version: 6 })

    expect(page.session.status).toBe("setup")
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual(
      expect.arrayContaining([
        `/api/practice/sessions/${encodeURIComponent(sessionId)}`,
        "/api/roles",
        "/api/practice/sessions/current",
      ]),
    )
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
  })

  it("recovers a history configuration from the current real practice setup", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") {
        return jsonResponse(createTrainableRolesResponse([createTrainableRole(roleId)]))
      }
      if (input === "/api/practice/sessions/current") return jsonResponse({ session: null })
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const prepared = await preparePracticeTrainingEntry({
      difficulty: "pressure",
      prioritizeWeaknesses: true,
      questionType: "projectDeepDive",
      source: "history",
      targetRoleId: roleId,
    })

    expect(prepared.resolution).toEqual({
      adjustments: [],
      configuration: {
        difficulty: "pressure",
        prioritizeWeaknesses: false,
        questionType: "projectDeepDive",
        source: "history",
        targetRoleId: roleId,
      },
      status: "available",
    })
    expect(prepared.page).toEqual({
      setupContext: expect.objectContaining({
        canPrioritizeWeaknesses: false,
        eligibleQuestionCounts: { history: 0, saved: 0 },
      }),
      session: {
        selection: prepared.resolution.configuration,
        status: "setup",
      },
    })
  })

  it("adjusts a history question type against the current role capabilities", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") {
        return jsonResponse(
          createTrainableRolesResponse([createTrainableRole(roleId, "paused", "Product Manager")]),
        )
      }
      if (input === "/api/practice/sessions/current") return jsonResponse({ session: null })
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const prepared = await preparePracticeTrainingEntry({
      questionType: "technicalFoundation",
      targetRoleId: roleId,
    })

    expect(prepared.resolution).toEqual({
      adjustments: ["practiceQuestionTypeUnsupported"],
      configuration: {
        difficulty: "basic",
        prioritizeWeaknesses: false,
        questionType: "projectDeepDive",
        source: "personalized",
        targetRoleId: roleId,
      },
      status: "adjusted",
    })
  })

  it.each([
    {
      name: "deleted",
      rolesResponse: () => createTrainableRolesResponse([createTrainableRole(roleId)]),
      targetRoleId: "missing-role",
      reason: "targetRoleDeleted" as const,
    },
    {
      name: "archived",
      rolesResponse: () => createTrainableRolesResponse(),
      targetRoleId: archivedRoleId,
      reason: "targetRoleArchived" as const,
    },
    {
      name: "prerequisite-unavailable",
      rolesResponse: () => createRolesResponse(),
      targetRoleId: roleId,
      reason: "targetRolePrerequisiteUnavailable" as const,
    },
  ])(
    "returns roleUnavailable when the history role is $name",
    async ({ rolesResponse, reason, targetRoleId }) => {
      fetchMock.mockImplementation(async (input) => {
        if (input === "/api/roles") return jsonResponse(rolesResponse())
        if (input === "/api/practice/sessions/current") return jsonResponse({ session: null })
        throw new Error(`Unexpected request: ${String(input)}`)
      })

      const prepared = await preparePracticeTrainingEntry({ targetRoleId })

      expect(prepared.resolution).toMatchObject({
        configuration: { targetRoleId: null },
        reason,
        status: "roleUnavailable",
      })
      expect(prepared.page.session).toEqual({
        selection: prepared.resolution.configuration,
        status: "setup",
      })
    },
  )

  it("fails without replacing an authoritative active practice session", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/roles") {
        return jsonResponse(createTrainableRolesResponse([createTrainableRole(roleId)]))
      }
      if (input === "/api/practice/sessions/current") {
        return jsonResponse({ session: createActiveSession("generatingQuestion") })
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })

    await expect(preparePracticeTrainingEntry({ targetRoleId: roleId })).rejects.toThrow(
      "practice session is active",
    )
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
  })

  it("continues to the next question with only the version and question ID", async () => {
    const response = createActiveSession("generatingQuestion", {
      attemptNumber: 2,
      version: 6,
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(response, 202))

    const session = requireActiveSession(
      await continueToNextPracticeQuestion({
        questionId,
        sessionId,
        version: 5,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/questions/next`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 5, questionId })
    expect(session).toMatchObject({
      attemptNumber: 2,
      status: "generatingQuestion",
      version: 6,
    })
  })

  it("retries the current question with only the version and question ID", async () => {
    const response = createActiveSession("answering", {
      attemptNumber: 2,
      version: 6,
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const session = requireActiveSession(
      await retryCurrentPracticeQuestion({
        questionId,
        sessionId,
        version: 5,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/questions/retry`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 5, questionId })
    expect(requestJson(fetchMock)).not.toHaveProperty("attemptId")
    expect(requestJson(fetchMock)).not.toHaveProperty("retryOfAttemptId")
    expect(requestJson(fetchMock)).not.toHaveProperty("questionType")
    expect(requestJson(fetchMock)).not.toHaveProperty("recommendation")
    expect(session).toMatchObject({
      attemptNumber: 2,
      question: { id: questionId },
      status: "answering",
      version: 6,
    })
  })

  it("sets saved state through the real endpoint with only the saved flag", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createActiveSession("answering", { version: 6 })))

    const session = requireActiveSession(
      await setQuestionSaved({
        questionId,
        sessionId,
        version: 5,
        isSaved: true,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/questions/saved`,
      expect.objectContaining({ credentials: "include", method: "PATCH" }),
    )
    expect(requestJson(fetchMock)).toEqual({
      version: 5,
      questionId,
      isSaved: true,
    })
    expect(requestJson(fetchMock)).not.toHaveProperty("isMarkedWeak")
    expect(session).toMatchObject({ status: "answering", version: 6 })
  })

  it("sets weak state through the real endpoint with only the weak flag", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createActiveSession("answering", { version: 6 })))

    const session = requireActiveSession(
      await setQuestionWeak({
        questionId,
        sessionId,
        version: 5,
        isMarkedWeak: true,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/questions/weak`,
      expect.objectContaining({ credentials: "include", method: "PATCH" }),
    )
    expect(requestJson(fetchMock)).toEqual({
      version: 5,
      questionId,
      isMarkedWeak: true,
    })
    expect(requestJson(fetchMock)).not.toHaveProperty("isSaved")
    expect(session).toMatchObject({ status: "answering", version: 6 })
  })

  it.each([
    [
      "hint",
      requestPracticeHint,
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/questions/hint`,
      { questionId, sessionId, version: 5 },
      createActiveSession("answering", {
        version: 6,
        question: {
          ...createQuestion(),
          answerHints: { content: ["Use a concrete metric."], status: "revealed" as const },
        },
      }),
    ],
    [
      "framework",
      requestAnswerFramework,
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/questions/framework`,
      { questionId, sessionId, version: 5 },
      createActiveSession("answering", {
        version: 6,
        question: {
          ...createQuestion(),
          answerFramework: {
            content: ["Context", "Action", "Result"],
            status: "revealed" as const,
          },
        },
      }),
    ],
  ] as const)(
    "sends the main $0 reveal request with only provenance",
    async (_name, requestFn, path, input, response) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(response))

      const session = requireActiveSession(await requestFn(input))

      expect(fetchMock).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ credentials: "include", method: "POST" }),
      )
      expect(requestJson(fetchMock)).toEqual({ version: 5, questionId })
      expect(requestJson(fetchMock)).not.toHaveProperty("content")
      expect(requestJson(fetchMock)).not.toHaveProperty("status")
      expect(requestJson(fetchMock)).not.toHaveProperty("guidanceType")
      expect(requestJson(fetchMock)).not.toHaveProperty("attemptId")
      expect(session).toMatchObject({ status: "answering", version: 6 })
    },
  )

  it("requests a main reference answer with only public provenance", async () => {
    const response = createActiveSession("answering", {
      version: 3,
      question: {
        ...createQuestion(),
        referenceAnswer: {
          content: null,
          status: "generating" as const,
          viewedBeforeSubmission: false,
        },
      },
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(response, 202))

    const session = requireActiveSession(
      await requestPracticeReferenceAnswer({ questionId, sessionId, version: 2 }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/questions/reference-answer`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 2, questionId })
    for (const field of ["targetType", "expectedKind", "content", "attemptId", "runId"]) {
      expect(requestJson(fetchMock)).not.toHaveProperty(field)
    }
    expect(session).toMatchObject({ status: "answering", version: 3 })
    if (session.status === "answering") {
      expect(session.question.referenceAnswer.status).toBe("generating")
    }
  })

  it("refreshes a main reference answer without changing the session version", async () => {
    const response = createActiveSession("answering", {
      version: 3,
      question: {
        ...createQuestion(),
        referenceAnswer: {
          content: {
            answer: "A grounded answer.",
            commonMistakes: ["Inventing a metric."],
            generatedAt: "2026-08-14T09:30:00Z",
            keyPoints: ["State the decision.", "Connect the evidence."],
            kind: "personalizedExample" as const,
          },
          status: "revealed" as const,
          viewedBeforeSubmission: true,
        },
      },
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const session = requireActiveSession(
      await getPracticeReferenceAnswerStatus({ questionId, sessionId, version: 3 }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/questions/reference-answer/refresh`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 3, questionId })
    expect(session).toMatchObject({ status: "answering", version: 3 })
  })

  it.each([
    [
      "hint",
      requestPracticeFollowUpHint,
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/follow-ups/hint`,
      { followUpQuestionId, questionId, sessionId, version: 3 },
    ],
    [
      "framework",
      requestPracticeFollowUpFramework,
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/follow-ups/framework`,
      { followUpQuestionId, questionId, sessionId, version: 3 },
    ],
  ] as const)(
    "sends the follow-up $0 reveal request with only provenance",
    async (_name, requestFn, path, input) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(createFollowUpSession("answeringFollowUp")))

      const session = requireActiveSession(await requestFn(input))

      expect(fetchMock).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ credentials: "include", method: "POST" }),
      )
      expect(requestJson(fetchMock)).toEqual({
        version: 3,
        questionId,
        followUpQuestionId,
      })
      expect(requestJson(fetchMock)).not.toHaveProperty("content")
      expect(requestJson(fetchMock)).not.toHaveProperty("status")
      expect(requestJson(fetchMock)).not.toHaveProperty("guidanceType")
      expect(requestJson(fetchMock)).not.toHaveProperty("attemptId")
      expect(session.status).toBe("answeringFollowUp")
    },
  )

  it("requests a follow-up reference answer with only the three public IDs", async () => {
    const response = createFollowUpSession("answeringFollowUp", {
      version: 5,
      currentFollowUp: {
        answer: null,
        question: {
          ...createFollowUpQuestion(followUpQuestionId, 1),
          referenceAnswer: {
            content: null,
            status: "generating" as const,
            viewedBeforeSubmission: false,
          },
        },
        status: "awaitingAnswer" as const,
      },
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(response, 202))

    const session = requireActiveSession(
      await requestPracticeFollowUpReferenceAnswer({
        followUpQuestionId,
        questionId,
        sessionId,
        version: 4,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/follow-ups/reference-answer`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 4, questionId, followUpQuestionId })
    for (const field of ["targetType", "expectedKind", "content", "attemptId", "runId"]) {
      expect(requestJson(fetchMock)).not.toHaveProperty(field)
    }
    expect(session).toMatchObject({ status: "answeringFollowUp", version: 5 })
  })

  it("refreshes a follow-up reference answer and preserves its addressed gap", async () => {
    const response = createFollowUpSession("answeringFollowUp", {
      version: 5,
    }) as Extract<PracticeActiveSessionState, { status: "answeringFollowUp" }>
    response.currentFollowUp.question.referenceAnswer = {
      content: {
        addressedGap: "Connect the decision to the result.",
        answer: "Tie the decision to the measurable result.",
        commonMistakes: ["Claiming team impact as personal impact."],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["Name the baseline.", "Connect the result."],
        kind: "personalizedSupplement" as const,
      },
      status: "revealed" as const,
      viewedBeforeSubmission: true,
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const session = requireActiveSession(
      await getPracticeFollowUpReferenceAnswerStatus({
        followUpQuestionId,
        questionId,
        sessionId,
        version: 5,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/follow-ups/reference-answer/refresh`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 5, questionId, followUpQuestionId })
    if (session.status === "answeringFollowUp") {
      expect(session.currentFollowUp.question.referenceAnswer).toMatchObject({
        status: "revealed",
        content: { addressedGap: "Connect the decision to the result." },
      })
    }
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

  it("submits the main answer to the real endpoint without mock-only fields", async () => {
    const response = createFollowUpSession("generatingFollowUp", { version: 3 })
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const session = requireActiveSession(
      await submitPrimaryAnswer({
        content: "主回答内容",
        questionId,
        sessionId,
        version: 2,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${sessionId}/answers/main`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({
      content: "主回答内容",
      questionId,
      version: 2,
    })
    expect(session.status).toBe("generatingFollowUp")
  })

  it("refreshes follow-up generation with only the requested version", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createFollowUpSession("answeringFollowUp")))

    const session = await getFollowUpGenerationStatus({ sessionId, version: 3 })

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${sessionId}/follow-up-generation/refresh`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 3 })
    expect(session.status).toBe("answeringFollowUp")
  })

  it.each([
    ["generatingFollowUp", createFollowUpSession("generatingFollowUp", { version: 4 })],
    ["evaluating", createFollowUpSession("evaluating", { version: 5 })],
  ] as const)("submits a follow-up answer and accepts %s", async (_status, response) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const session = requireActiveSession(
      await submitFollowUpAnswer({
        content: "追问回答内容",
        followUpQuestionId,
        questionId,
        sessionId,
        version: response.version - 1,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${sessionId}/answers/follow-up`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({
      content: "追问回答内容",
      followUpQuestionId,
      questionId,
      version: response.version - 1,
    })
    expect(session.status).toBe(_status)
  })

  it("ends follow-ups through the real endpoint with only public provenance", async () => {
    const response = createFollowUpSession("evaluating", {
      version: 5,
      followUpExchanges: [],
      followUpCompletion: {
        status: "endedEarly" as const,
        unansweredQuestion: createFollowUpQuestion(followUpQuestionId, 1),
      },
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const session = requireActiveSession(
      await endPracticeFollowUps({
        followUpQuestionId,
        questionId,
        sessionId,
        version: 4,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${sessionId}/follow-ups/end`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({
      followUpQuestionId,
      questionId,
      version: 4,
    })
    expect(requestJson(fetchMock)).not.toHaveProperty("completionReason")
    expect(requestJson(fetchMock)).not.toHaveProperty("unansweredQuestion")
    expect(requestJson(fetchMock)).not.toHaveProperty("attemptId")
    expect(session).toMatchObject({
      status: "evaluating",
      version: 5,
      followUpCompletion: {
        status: "endedEarly",
        unansweredQuestion: { id: followUpQuestionId, order: 1 },
      },
    })
  })

  it("refreshes evaluation with only version and never sends questionId", async () => {
    const response = createFollowUpSession("review", { version: 4 })
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    const session = requireActiveSession(
      await getPracticeEvaluationStatus({
        sessionId,
        questionId,
        version: 3,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/practice/sessions/${sessionId}/evaluation/refresh`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
    expect(requestJson(fetchMock)).toEqual({ version: 3 })
    expect(requestJson(fetchMock)).not.toHaveProperty("questionId")
    expect(session.status).toBe("review")
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
