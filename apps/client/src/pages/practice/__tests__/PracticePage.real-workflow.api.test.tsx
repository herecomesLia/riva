import * as testing from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { renderWithProviders } from "@/test/render"
import { PracticePage } from "@/pages/practice/PracticePage"

const roleId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"
const attemptId = "33333333-3333-4333-8333-333333333333"
const nextAttemptId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const questionId = "44444444-4444-4444-8444-444444444444"
const nextQuestionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const materialId = "55555555-5555-4555-8555-555555555555"
const followUpQuestionOneId = "66666666-6666-4666-8666-666666666666"
const followUpQuestionTwoId = "77777777-7777-4777-8777-777777777777"
const mainAnswerId = "88888888-8888-4888-8888-888888888888"
const followUpAnswerOneId = "99999999-9999-4999-8999-999999999999"
const followUpAnswerTwoId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

const selection = {
  difficulty: "basic" as const,
  prioritizeWeaknesses: false,
  questionType: "projectDeepDive" as const,
  source: "personalized" as const,
  targetRoleId: roleId,
}

const question = {
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

const nextQuestion = {
  ...question,
  id: nextQuestionId,
  prompt: "请介绍另一个你主导的复杂项目。",
}

const mainAnswer = {
  content: "我负责定位问题、推动方案落地并验证结果。",
  createdAt: "2026-08-12T08:01:00.000Z",
  id: mainAnswerId,
  order: 1,
}

function followUpQuestion(id: string, order: 1 | 2) {
  return {
    answerFramework: { content: null, status: "notRequested" as const },
    answerHints: { content: null, status: "notRequested" as const },
    createdAt: `2026-08-12T08:0${order + 1}:00.000Z`,
    id,
    order,
    prompt: order === 1 ? "请补充结果证据。" : "请说明风险控制。",
    referenceAnswer: {
      content: null,
      status: "notRequested" as const,
      viewedBeforeSubmission: false,
    },
  }
}

function answer(id: string, content: string, order: 2 | 3) {
  return {
    content,
    createdAt: `2026-08-12T08:0${order + 1}:00.000Z`,
    id,
    order,
  }
}

const firstQuestion = followUpQuestion(followUpQuestionOneId, 1)
const secondQuestion = followUpQuestion(followUpQuestionTwoId, 2)
const firstAnswer = answer(followUpAnswerOneId, "通过实验组和对照组验证性能收益。", 2)
const secondAnswer = answer(followUpAnswerTwoId, "设置告警阈值并准备回滚方案。", 3)
const firstExchange = { answer: firstAnswer, question: firstQuestion, status: "answered" as const }
const secondExchange = {
  answer: secondAnswer,
  question: secondQuestion,
  status: "answered" as const,
}

function base(version: number) {
  return {
    attemptId,
    attemptNumber: 1,
    language: "zh-CN" as const,
    selection,
    sessionId,
    startedAt: "2026-08-12T08:00:00.000Z",
    version,
  }
}

function session(
  status: "answering" | "generatingFollowUp" | "answeringFollowUp",
  version: number,
) {
  if (status === "answering") return { ...base(version), question, status }
  if (status === "generatingFollowUp") {
    return {
      ...base(version),
      followUpExchanges: version === 3 ? [] : [firstExchange],
      mainAnswer,
      question,
      status,
    }
  }
  return {
    ...base(version),
    currentFollowUp: {
      answer: null,
      question: version === 4 ? firstQuestion : secondQuestion,
      status: "awaitingAnswer" as const,
    },
    followUpExchanges: version === 4 ? [] : [firstExchange],
    mainAnswer,
    question,
    status,
  }
}

function evaluating(version: number) {
  return {
    ...base(version),
    followUpCompletion: { reason: "allAnswered" as const, status: "completed" as const },
    followUpExchanges: [firstExchange, secondExchange],
    mainAnswer,
    question,
    status: "evaluating" as const,
    submittedAt: "2026-08-12T08:04:00.000Z",
  }
}

function nextQuestionSession(status: "generatingQuestion" | "answering", version: number) {
  const nextBase = {
    ...base(version),
    attemptId: nextAttemptId,
    attemptNumber: 2,
  }
  return status === "generatingQuestion"
    ? { ...nextBase, status }
    : { ...nextBase, question: nextQuestion, status }
}

function review(version: number) {
  return {
    ...base(version),
    evaluation: {
      dimensionScores: [
        "relevance",
        "structure",
        "specificity",
        "personalContribution",
        "resultsAndEvidence",
        "roleAlignment",
        "communication",
        "riskControl",
      ].map((dimension) => ({ dimension, explanation: "说明具体。", score: 86 })),
      evaluatedAt: "2026-08-12T08:05:00.000Z",
      overallScore: 86,
    },
    followUpCompletion: { reason: "allAnswered" as const, status: "completed" as const },
    followUpExchanges: [firstExchange, secondExchange],
    mainAnswer,
    question,
    review: {
      exposedWeaknesses: ["风险控制"],
      highlights: ["能够用实验验证结果"],
      improvementSuggestions: ["继续量化风险控制"],
      mainIssues: ["风险描述可以更具体"],
      overallPerformance: "回答结构清晰，证据完整。",
      recommendation: { action: "retryCurrent" as const, reason: "继续打磨风险表达。" },
      reusableAnswerStructure: ["背景、行动、结果"],
    },
    status: "review" as const,
    version,
  }
}

const guaranteedMainReferenceAnswer = {
  content: {
    answer: "自动生成的主问题参考答案。",
    commonMistakes: ["不要虚构结果。"],
    generatedAt: "2026-08-12T08:05:30.000Z",
    keyPoints: ["说明决策。", "连接证据。"],
    kind: "personalizedExample" as const,
  },
  status: "revealed" as const,
  viewedBeforeSubmission: false,
}

const guaranteedFollowUpReferenceAnswer = {
  content: {
    addressedGap: "补充可验证的结果证据。",
    answer: "自动生成的追问参考答案。",
    commonMistakes: ["不要把团队结果当成个人结果。"],
    generatedAt: "2026-08-12T08:05:31.000Z",
    keyPoints: ["说清基线。", "连接结果。"],
    kind: "personalizedSupplement" as const,
  },
  status: "revealed" as const,
  viewedBeforeSubmission: false,
}

function evaluatingWithGeneratingReferences(version: number) {
  const snapshot = evaluating(version)
  return {
    ...snapshot,
    followUpExchanges: snapshot.followUpExchanges.map((exchange) => ({
      ...exchange,
      question: {
        ...exchange.question,
        referenceAnswer: {
          content: null,
          status: "generating" as const,
          viewedBeforeSubmission: false,
        },
      },
    })),
    question: {
      ...snapshot.question,
      referenceAnswer: {
        content: null,
        status: "generating" as const,
        viewedBeforeSubmission: false,
      },
    },
  }
}

function guaranteedReview(version: number) {
  const snapshot = review(version)
  return {
    ...snapshot,
    followUpExchanges: snapshot.followUpExchanges.map((exchange) => ({
      ...exchange,
      question: {
        ...exchange.question,
        referenceAnswer: guaranteedFollowUpReferenceAnswer,
      },
    })),
    question: {
      ...snapshot.question,
      referenceAnswer: guaranteedMainReferenceAnswer,
    },
  }
}

function endedEarlyEvaluating(version: number) {
  return {
    ...base(version),
    followUpCompletion: {
      status: "endedEarly" as const,
      unansweredQuestion: firstQuestion,
    },
    followUpExchanges: [],
    mainAnswer,
    question,
    status: "evaluating" as const,
    submittedAt: "2026-08-12T08:04:00.000Z",
  }
}

function endedEarlyReview(version: number) {
  return {
    ...review(version),
    followUpCompletion: {
      status: "endedEarly" as const,
      unansweredQuestion: firstQuestion,
    },
    followUpExchanges: [],
  }
}

function completed(version: number) {
  return {
    attemptId,
    attemptNumber: 1,
    completedAt: "2026-08-12T08:06:00.000Z",
    completionReason: "reviewCompleted" as const,
    finalAttemptAverageScore: 91,
    language: "zh-CN" as const,
    markedWeakQuestionCount: 1,
    nextStepSuggestion: "下一轮继续量化风险控制结果。",
    questionsCompleted: 2,
    retryCount: 1,
    savedQuestionCount: 1,
    selection,
    sessionId,
    startedAt: "2026-08-12T08:00:00.000Z",
    status: "completed" as const,
    unfinishedAttempt: null,
    version,
  }
}

function earlyCompleted(version: number) {
  return {
    attemptId,
    attemptNumber: 1,
    completedAt: "2026-08-12T08:06:00.000Z",
    completionReason: "userEndedEarly" as const,
    finalAttemptAverageScore: 0,
    language: "zh-CN" as const,
    markedWeakQuestionCount: 0,
    nextStepSuggestion: null,
    questionsCompleted: 0,
    retryCount: 0,
    savedQuestionCount: 0,
    selection,
    sessionId,
    startedAt: "2026-08-12T08:00:00.000Z",
    status: "completed" as const,
    unfinishedAttempt: {
      attemptId,
      attemptNumber: 1,
      question,
      selection,
    },
    version,
  }
}

function rolesResponse() {
  return {
    currentRoleId: roleId,
    profileContext: { completed: true, exists: true, version: 1 },
    roles: [
      {
        company: "Riva",
        createdAt: "2026-08-10T08:00:00Z",
        experienceRange: { maxYears: 5, minYears: 2 },
        id: roleId,
        jobDescription: {
          parsingFailureReason: null,
          rawText: null,
          status: "missing",
          version: null,
        },
        jobDescriptionAnalysis: null,
        location: "Shanghai",
        matchingAnalysis: null,
        preparationStatus: "paused",
        recruitmentType: "experienced",
        title: "Frontend Engineer",
        updatedAt: "2026-08-10T09:00:00Z",
        version: 1,
      },
    ],
  }
}

function setupCapabilitiesResponse() {
  return {
    availability: { status: "blocked", reason: "jobDescriptionMissing" },
    canPrioritizeWeaknesses: false,
    historyQuestionCount: 0,
    questionSourceAvailability: [],
    savedQuestionCount: 0,
    trainingAvailableTargetRoleIds: [],
  }
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  })
}

function requestBody(call: [RequestInfo | URL, RequestInit | undefined]) {
  return JSON.parse(String(call[1]?.body)) as unknown
}

describe("PracticePage real API workflow", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    await i18n.changeLanguage("zh-CN")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("runs the real wire contract from answering through two follow-ups to review", async () => {
    const user = userEvent.setup()
    const current = session("answering", 2)
    if (current.status !== "answering") return
    const mainSubmitted = session("generatingFollowUp", 3)
    const firstFollowUpReady = session("answeringFollowUp", 4)
    const firstAnswerSubmitted = session("generatingFollowUp", 5)
    const secondFollowUpReady = session("answeringFollowUp", 6)
    const answerSubmitted = evaluating(7)
    const finalReview = review(8)

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/answers/main`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({
          content: "主回答中的行动与结果。",
          questionId,
          version: 2,
        })
        return jsonResponse(mainSubmitted)
      }
      if (path === `/api/practice/sessions/${sessionId}/follow-up-generation/refresh`) {
        expect(init?.method).toBe("POST")
        const body = requestBody([input, init])
        if (body && typeof body === "object" && "version" in body && body.version === 3) {
          expect(body).toEqual({ version: 3 })
          return jsonResponse(firstFollowUpReady)
        }
        expect(body).toEqual({ version: 5 })
        return jsonResponse(secondFollowUpReady)
      }
      if (path === `/api/practice/sessions/${sessionId}/answers/follow-up`) {
        expect(init?.method).toBe("POST")
        const body = requestBody([input, init])
        if (
          body &&
          typeof body === "object" &&
          "followUpQuestionId" in body &&
          body.followUpQuestionId === followUpQuestionOneId
        ) {
          expect(body).toEqual({
            content: "第一轮追问回答。",
            followUpQuestionId: followUpQuestionOneId,
            questionId,
            version: 4,
          })
          return jsonResponse(firstAnswerSubmitted)
        }
        expect(body).toEqual({
          content: "第二轮追问回答。",
          followUpQuestionId: followUpQuestionTwoId,
          questionId,
          version: 6,
        })
        return jsonResponse(answerSubmitted)
      }
      if (path === `/api/practice/sessions/${sessionId}/evaluation/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 7 })
        return jsonResponse(
          fetchMock.mock.calls.filter(([calledInput]) => calledInput === path).length === 1
            ? answerSubmitted
            : finalReview,
        )
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await user.type(
      await testing.screen.findByLabelText(i18n.t("practice.answer.label")),
      "主回答中的行动与结果。",
    )
    await user.click(testing.screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))
    expect(await testing.screen.findByTestId("practice-generating-follow-up-state")).toBeVisible()
    expect(await testing.screen.findByTestId("practice-answering-follow-up-state")).toBeVisible()

    await user.type(
      testing.screen.getByLabelText(i18n.t("practice.followUp.answerLabel")),
      "第一轮追问回答。",
    )
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }),
    )
    expect(await testing.screen.findByTestId("practice-generating-follow-up-state")).toBeVisible()
    expect(await testing.screen.findByTestId("practice-answering-follow-up-state")).toBeVisible()

    await user.type(
      testing.screen.getByLabelText(i18n.t("practice.followUp.answerLabel")),
      "第二轮追问回答。",
    )
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }),
    )
    expect(await testing.screen.findByTestId("practice-evaluating-state")).toBeVisible()
    const final = await testing.screen.findByTestId("practice-review-state", {}, { timeout: 4_000 })

    expect(final).toHaveTextContent("86")
    expect(final).toHaveTextContent("回答结构清晰，证据完整。")
    expect(final).toHaveTextContent("继续打磨风险表达。")
    expect(final).toHaveTextContent(firstQuestion.prompt)
    expect(final).toHaveTextContent(firstAnswer.content)
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/roles"))).toBe(true)
    const evaluationCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("evaluation/refresh"),
    )
    expect(evaluationCalls).toHaveLength(2)
    for (const [input, init] of evaluationCalls) {
      expect(requestBody([input, init])).toEqual({ version: 7 })
      expect(requestBody([input, init])).not.toHaveProperty("questionId")
    }
  })

  it("keeps reference answers inside the evaluation poll and renders the guaranteed review snapshot", async () => {
    const pending = evaluatingWithGeneratingReferences(7)
    const finalReview = guaranteedReview(8)
    let evaluationRefreshCount = 0

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") {
        return jsonResponse({ session: pending })
      }
      if (path === `/api/practice/sessions/${sessionId}/evaluation/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 7 })
        evaluationRefreshCount += 1
        return jsonResponse(evaluationRefreshCount === 1 ? pending : finalReview)
      }
      throw new Error(`Unexpected request during reference guarantee workflow: ${path}`)
    })

    const user = userEvent.setup()
    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    expect(await testing.screen.findByTestId("practice-evaluating-state")).toBeVisible()
    const reviewState = await testing.screen.findByTestId(
      "practice-review-state",
      {},
      { timeout: 4_000 },
    )
    expect(reviewState).toBeVisible()
    expect(evaluationRefreshCount).toBeGreaterThanOrEqual(2)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("reference-answer"))).toBe(
      false,
    )

    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.referenceAnswer.expand"),
      }),
    )
    expect(await testing.screen.findByText("自动生成的主问题参考答案。")).toBeVisible()

    const followUpExpandButtons = testing.screen.getAllByRole("button", {
      name: i18n.t("practice.followUpReview.expandReference"),
    })
    expect(followUpExpandButtons).toHaveLength(2)
    await user.click(followUpExpandButtons[0]!)
    await user.click(followUpExpandButtons[1]!)
    const followUpReferenceAnswers = await testing.screen.findAllByText("自动生成的追问参考答案。")
    expect(followUpReferenceAnswers).toHaveLength(2)
    for (const referenceAnswer of followUpReferenceAnswers) {
      expect(referenceAnswer).toBeVisible()
    }
  })

  it("continues from review through the real next-question generation poll", async () => {
    const user = userEvent.setup()
    const current = review(8)
    const nextGenerating = nextQuestionSession("generatingQuestion", 9)
    const nextAnswering = nextQuestionSession("answering", 10)
    let generationRefreshCount = 0

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/questions/next`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 8, questionId })
        return jsonResponse(nextGenerating)
      }
      if (path === `/api/practice/sessions/${sessionId}/question-generation/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 9 })
        generationRefreshCount += 1
        return jsonResponse(generationRefreshCount === 1 ? nextGenerating : nextAnswering)
      }
      throw new Error(`Unexpected request during next-question workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await testing.screen.findByTestId("practice-review-state")
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.review.nextQuestion"),
      }),
    )

    expect(await testing.screen.findByTestId("practice-generating-state")).toBeVisible()
    const answering = await testing.screen.findByTestId(
      "practice-answering-state",
      {},
      {
        timeout: 4_000,
      },
    )
    expect(answering).toHaveTextContent(nextQuestion.prompt)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("questions/next"))).toBe(
      true,
    )
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("question-generation/refresh")),
    ).toBe(true)
  })

  it("updates saved state through the real API and uses the latest version to unsave", async () => {
    const user = userEvent.setup()
    const current = session("answering", 2)
    let saved = false

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/questions/saved`) {
        expect(init?.method).toBe("PATCH")
        const body = requestBody([input, init])
        expect(body).toEqual({
          version: saved ? 3 : 2,
          questionId,
          isSaved: !saved,
        })
        saved = !saved
        return jsonResponse({
          ...current,
          question: { ...question, isSaved: saved },
          version: saved ? 3 : 4,
        })
      }
      throw new Error(`Unexpected request during saved-flag workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await user.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.questionActions.save"),
      }),
    )
    expect(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.questionActions.unsave"),
      }),
    ).toHaveAttribute("aria-pressed", "true")

    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.questionActions.unsave"),
      }),
    )
    expect(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.questionActions.save"),
      }),
    ).toHaveAttribute("aria-pressed", "false")
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/questions/saved")),
    ).toHaveLength(2)
  })

  it("keeps review content visible while marking the question weak through the real API", async () => {
    const user = userEvent.setup()
    const current = review(8)
    const markedWeak = {
      ...current,
      question: { ...question, isMarkedWeak: true },
      version: 9,
    }

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/questions/weak`) {
        expect(init?.method).toBe("PATCH")
        expect(requestBody([input, init])).toEqual({
          version: 8,
          questionId,
          isMarkedWeak: true,
        })
        return jsonResponse(markedWeak)
      }
      throw new Error(`Unexpected request during weak-flag workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    const reviewState = await testing.screen.findByTestId("practice-review-state")
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.questionActions.markWeak"),
      }),
    )

    expect(await testing.screen.findByTestId("practice-review-state")).toBe(reviewState)
    expect(reviewState).toHaveTextContent("86")
    expect(reviewState).toHaveTextContent("回答结构清晰，证据完整。")
    expect(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.questionActions.unmarkWeak"),
      }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("ends review through the real complete API and renders the backend completed summary", async () => {
    const user = userEvent.setup()
    const current = review(8)
    const finished = completed(9)

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/complete`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 8 })
        return jsonResponse(finished)
      }
      throw new Error(`Unexpected request during completion workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await testing.screen.findByTestId("practice-review-state")
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.review.endSession") }),
    )
    await user.click(
      testing.screen.getAllByRole("button", { name: i18n.t("practice.review.endSession") }).at(-1)!,
    )

    const completedState = await testing.screen.findByTestId("practice-completed-state")
    expect(completedState).toHaveTextContent("完成题数：2")
    expect(completedState).toHaveTextContent("重练次数：1")
    expect(completedState).toHaveTextContent("收藏题数：1")
    expect(completedState).toHaveTextContent("标记薄弱题数：1")
    expect(completedState).toHaveTextContent("最终作答平均分：91 分")
    expect(completedState).toHaveTextContent(finished.nextStepSuggestion)
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/complete"))).toBe(true)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("refresh"))).toBe(false)
  })

  it("ends an unanswered question through the real end API and renders zero completed-question stats", async () => {
    const user = userEvent.setup()
    const current = session("answering", 2)
    const finished = earlyCompleted(3)

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/end`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 2, questionId })
        return jsonResponse(finished)
      }
      throw new Error(`Unexpected request during early completion workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await testing.screen.findByTestId("practice-answering-state")
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.questionActions.end") }),
    )
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.dialog.confirmEnd") }),
    )

    const completedState = await testing.screen.findByTestId("practice-completed-state")
    expect(completedState).toHaveTextContent("完成题数：0")
    expect(completedState).toHaveTextContent("重练次数：0")
    expect(completedState).toHaveTextContent("收藏题数：0")
    expect(completedState).toHaveTextContent("标记薄弱题数：0")
    expect(completedState).toHaveTextContent("最终作答平均分：0 分")
    expect(completedState.querySelector("p.text-muted-foreground")).toBeNull()
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/end"))).toBe(true)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("refresh"))).toBe(false)
  })

  it("ends the current follow-up through the real API and lets evaluation polling reach ended-early review", async () => {
    const user = userEvent.setup()
    const current = session("answeringFollowUp", 4)
    if (current.status !== "answeringFollowUp") return
    const stopped = endedEarlyEvaluating(5)
    const finalReview = endedEarlyReview(6)
    let evaluationRefreshCount = 0

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/follow-ups/end`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({
          followUpQuestionId: followUpQuestionOneId,
          questionId,
          version: 4,
        })
        return jsonResponse(stopped)
      }
      if (path === `/api/practice/sessions/${sessionId}/evaluation/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 5 })
        evaluationRefreshCount += 1
        return jsonResponse(evaluationRefreshCount === 1 ? stopped : finalReview)
      }
      throw new Error(`Unexpected request during follow-up stop workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await testing.screen.findByTestId("practice-answering-follow-up-state")
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.endAnswering") }),
    )
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.confirmEnd") }),
    )

    expect(await testing.screen.findByTestId("practice-evaluating-state")).toBeVisible()
    const reviewState = await testing.screen.findByTestId(
      "practice-review-state",
      {},
      { timeout: 4_000 },
    )
    expect(reviewState).toBeVisible()
    expect(reviewState).toHaveTextContent(firstQuestion.prompt)
    expect(reviewState).toHaveTextContent(i18n.t("practice.followUp.endedEarly"))
    expect(evaluationRefreshCount).toBe(2)
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("follow-up-generation/refresh"),
      ),
    ).toBe(false)
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("answers/follow-up")),
    ).toBe(false)
  })

  it("retries from review into the same question and submits a new answer without question polling", async () => {
    const user = userEvent.setup()
    const current = review(8)
    const retried = {
      ...base(9),
      attemptId: nextAttemptId,
      attemptNumber: 2,
      question,
      status: "answering" as const,
    }
    const submitted = {
      ...session("generatingFollowUp", 10),
      attemptId: nextAttemptId,
      attemptNumber: 2,
      mainAnswer: { ...mainAnswer, content: "重答中的新行动与结果。" },
      question,
    }
    const followUpReady = {
      ...session("answeringFollowUp", 11),
      attemptId: nextAttemptId,
      attemptNumber: 2,
      mainAnswer: { ...mainAnswer, content: "重答中的新行动与结果。" },
      question,
    }

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/questions/retry`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 8, questionId })
        return jsonResponse(retried)
      }
      if (path === `/api/practice/sessions/${sessionId}/answers/main`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({
          content: "重答中的新行动与结果。",
          questionId,
          version: 9,
        })
        return jsonResponse(submitted)
      }
      if (path === `/api/practice/sessions/${sessionId}/follow-up-generation/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 10 })
        return jsonResponse(followUpReady)
      }
      throw new Error(`Unexpected request during retry workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await testing.screen.findByTestId("practice-review-state")
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.review.retryCurrent"),
      }),
    )

    const answering = await testing.screen.findByTestId("practice-answering-state")
    expect(answering).toHaveTextContent(question.prompt)
    const answerInput = await testing.screen.findByLabelText(i18n.t("practice.answer.label"))
    expect(answerInput).toHaveValue("")
    expect(answering).not.toHaveTextContent(mainAnswer.content)
    expect(retried.attemptId).toBe(nextAttemptId)
    expect(retried.attemptId).not.toBe(current.attemptId)
    expect(retried.question.id).toBe(current.question.id)

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("questions/retry"))).toBe(
      true,
    )
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("question-generation/refresh")),
    ).toBe(false)

    await user.type(answerInput, "重答中的新行动与结果。")
    await user.click(testing.screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))
    expect(await testing.screen.findByTestId("practice-generating-follow-up-state")).toBeVisible()
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("question-generation/refresh")),
    ).toBe(false)
  })

  it.each(["generatingFollowUp", "evaluating", "review"] as const)(
    "recovers a browser refresh directly in %s",
    async (status) => {
      const current =
        status === "generatingFollowUp"
          ? session("generatingFollowUp", 3)
          : status === "evaluating"
            ? evaluating(7)
            : review(8)
      const followUpReady = session("answeringFollowUp", 4)
      const finalReview = review(8)

      fetchMock.mockImplementation(async (input) => {
        const path = String(input)
        if (path === "/api/roles") return jsonResponse(rolesResponse())
        if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
        if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
        if (path.endsWith("/follow-up-generation/refresh")) return jsonResponse(followUpReady)
        if (path.endsWith("/evaluation/refresh")) return jsonResponse(finalReview)
        throw new Error(`Unexpected request during refresh recovery: ${path}`)
      })

      renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

      if (status === "generatingFollowUp") {
        expect(
          await testing.screen.findByTestId("practice-generating-follow-up-state"),
        ).toBeVisible()
        expect(
          await testing.screen.findByTestId("practice-answering-follow-up-state"),
        ).toBeVisible()
        expect(
          fetchMock.mock.calls.some(([input]) =>
            String(input).endsWith("follow-up-generation/refresh"),
          ),
        ).toBe(true)
      } else if (status === "evaluating") {
        expect(await testing.screen.findByTestId("practice-review-state")).toBeVisible()
        expect(
          fetchMock.mock.calls.some(([input]) => String(input).endsWith("evaluation/refresh")),
        ).toBe(true)
      } else {
        expect(await testing.screen.findByTestId("practice-review-state")).toBeVisible()
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes("refresh"))).toBe(
          false,
        )
      }
    },
  )

  it("reveals main hint and framework through the real endpoints using the latest version", async () => {
    const user = userEvent.setup()
    const current = session("answering", 2)
    if (current.status !== "answering") return
    const hinted = {
      ...current,
      question: {
        ...current.question,
        answerHints: { content: ["用一个可验证的结果收束回答。"], status: "revealed" as const },
      },
      version: 3,
    }
    const framed = {
      ...hinted,
      question: {
        ...hinted.question,
        answerFramework: {
          content: ["背景", "行动", "结果"],
          status: "revealed" as const,
        },
      },
      version: 4,
    }

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/questions/hint`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 2, questionId })
        return jsonResponse(hinted)
      }
      if (path === `/api/practice/sessions/${sessionId}/questions/framework`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 3, questionId })
        return jsonResponse(framed)
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await user.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.guidance.requestHint"),
      }),
    )
    expect(await testing.screen.findByText("用一个可验证的结果收束回答。")).toBeVisible()

    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.guidance.requestFramework"),
      }),
    )
    expect(await testing.screen.findByText("背景")).toBeVisible()
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("questions/")),
    ).toHaveLength(2)
  })

  it("recovers revealed main guidance from GET without sending a reveal request", async () => {
    const recoveredQuestion = {
      ...question,
      answerHints: { content: ["刷新后仍可见的提示。"], status: "revealed" as const },
      answerFramework: {
        content: ["刷新后仍可见的框架。"],
        status: "revealed" as const,
      },
    }
    const current = { ...session("answering", 4), question: recoveredQuestion }

    fetchMock.mockImplementation(async (input) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      throw new Error(`Unexpected request during guidance recovery: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    expect(await testing.screen.findByText("刷新后仍可见的提示。")).toBeVisible()
    expect(await testing.screen.findByText("刷新后仍可见的框架。")).toBeVisible()
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("questions/"))).toBe(false)
  })

  it("requests and polls a main reference answer through the real endpoints", async () => {
    const user = userEvent.setup()
    const current = session("answering", 2)
    if (current.status !== "answering") return
    const generating = {
      ...current,
      question: {
        ...current.question,
        referenceAnswer: {
          content: null,
          status: "generating" as const,
          viewedBeforeSubmission: false,
        },
      },
      version: 3,
    }
    const revealed = {
      ...generating,
      question: {
        ...generating.question,
        referenceAnswer: {
          content: {
            answer: "参考答案中的项目行动与结果。",
            commonMistakes: ["只描述职责而没有结果。"],
            generatedAt: "2026-08-12T08:05:00.000Z",
            keyPoints: ["说明个人行动。", "量化最终结果。"],
            kind: "personalizedExample" as const,
          },
          status: "revealed" as const,
          viewedBeforeSubmission: true,
        },
      },
    }
    let refreshCount = 0

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/questions/reference-answer`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 2, questionId })
        return jsonResponse(generating)
      }
      if (path === `/api/practice/sessions/${sessionId}/questions/reference-answer/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 3, questionId })
        refreshCount += 1
        return jsonResponse(refreshCount === 1 ? generating : revealed)
      }
      throw new Error(`Unexpected request during main reference answer workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await user.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.referenceAnswer.request"),
      }),
    )
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.referenceAnswer.confirm"),
      }),
    )

    expect(await testing.screen.findByText("参考答案中的项目行动与结果。")).toBeVisible()

    const requestCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/questions/reference-answer"),
    )
    expect(requestCalls).toHaveLength(1)
    const refreshCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/questions/reference-answer/refresh"),
    )
    expect(refreshCalls.length).toBeGreaterThanOrEqual(2)
    for (const [input, init] of refreshCalls) {
      expect(requestBody([input, init])).toEqual({ version: 3, questionId })
    }
  })

  it("keeps a v4 hint mutation and reference completion when an old v3 refresh resolves late", async () => {
    const user = userEvent.setup()
    const current = session("answering", 2)
    if (current.status !== "answering") return
    const generating = {
      ...current,
      question: {
        ...current.question,
        referenceAnswer: {
          content: null,
          status: "generating" as const,
          viewedBeforeSubmission: false,
        },
      },
      version: 3,
    }
    const referenceAnswer = {
      content: {
        answer: "后台完成的参考答案。",
        commonMistakes: ["只描述职责。"],
        generatedAt: "2026-08-12T08:05:00.000Z",
        keyPoints: ["说明行动。", "量化结果。"],
        kind: "personalizedExample" as const,
      },
      status: "revealed" as const,
      viewedBeforeSubmission: true,
    }
    const hinted = {
      ...generating,
      question: {
        ...generating.question,
        answerHints: { content: ["补充结果指标。"], status: "revealed" as const },
        referenceAnswer,
      },
      version: 4,
    }
    const submittedBase = session("generatingFollowUp", 5)
    if (submittedBase.status !== "generatingFollowUp") return
    const submitted = {
      ...submittedBase,
      question: hinted.question,
      version: 5,
    }
    const staleRefresh = {
      ...generating,
      question: { ...generating.question, referenceAnswer },
    }
    let refreshCount = 0
    let releaseOldRefresh: ((response: Response) => void) | undefined
    const oldRefresh = new Promise<Response>((resolve) => {
      releaseOldRefresh = resolve
    })

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/questions/reference-answer`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 2, questionId })
        return jsonResponse(generating)
      }
      if (path === `/api/practice/sessions/${sessionId}/questions/reference-answer/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 3, questionId })
        refreshCount += 1
        return oldRefresh
      }
      if (path === `/api/practice/sessions/${sessionId}/questions/hint`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 3, questionId })
        return jsonResponse(hinted)
      }
      if (path === `/api/practice/sessions/${sessionId}/answers/main`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({
          content: "用户在 v4 提交的回答。",
          questionId,
          version: 4,
        })
        return jsonResponse(submitted)
      }
      if (path === `/api/practice/sessions/${sessionId}/follow-up-generation/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 5 })
        return jsonResponse(submitted)
      }
      throw new Error(`Unexpected request during concurrent reference cache workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await user.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.referenceAnswer.request"),
      }),
    )
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.referenceAnswer.confirm"),
      }),
    )
    await testing.waitFor(() => expect(refreshCount).toBe(1))

    await user.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.guidance.requestHint"),
      }),
    )
    expect(await testing.screen.findByText("补充结果指标。")).toBeVisible()
    expect(await testing.screen.findByText("后台完成的参考答案。")).toBeVisible()

    if (releaseOldRefresh === undefined) throw new Error("old refresh was not started")
    releaseOldRefresh(jsonResponse(staleRefresh))
    await testing.waitFor(() =>
      expect(testing.screen.getByText("后台完成的参考答案。")).toBeVisible(),
    )

    await user.type(
      await testing.screen.findByLabelText(i18n.t("practice.answer.label")),
      "用户在 v4 提交的回答。",
    )
    await user.click(testing.screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))
    expect(await testing.screen.findByTestId("practice-generating-follow-up-state")).toBeVisible()
  })

  it("recovers a generating main reference answer from GET without requesting again", async () => {
    const current = session("answering", 4)
    if (current.status !== "answering") return
    const generating = {
      ...current,
      question: {
        ...current.question,
        referenceAnswer: {
          content: null,
          status: "generating" as const,
          viewedBeforeSubmission: false,
        },
      },
    }
    const recovered = {
      ...generating,
      question: {
        ...generating.question,
        referenceAnswer: {
          content: {
            answer: "浏览器恢复后的参考答案。",
            commonMistakes: ["跳过关键证据。"],
            generatedAt: "2026-08-12T08:06:00.000Z",
            keyPoints: ["先说明背景。", "再说明结果。"],
            kind: "technicalReference" as const,
          },
          status: "revealed" as const,
          viewedBeforeSubmission: true,
        },
      },
    }

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: generating })
      if (path === `/api/practice/sessions/${sessionId}/questions/reference-answer/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 4, questionId })
        return jsonResponse(recovered)
      }
      throw new Error(`Unexpected request during main reference answer recovery: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    expect(await testing.screen.findByText("浏览器恢复后的参考答案。")).toBeVisible()
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("/questions/reference-answer")),
    ).toBe(false)
  })

  it("keeps the answer composer usable and stops reference polling after submit", async () => {
    const user = userEvent.setup()
    const current = session("answering", 2)
    if (current.status !== "answering") return
    const generating = {
      ...current,
      question: {
        ...current.question,
        referenceAnswer: {
          content: null,
          status: "generating" as const,
          viewedBeforeSubmission: false,
        },
      },
      version: 3,
    }
    const submittedBase = session("generatingFollowUp", 3)
    if (submittedBase.status !== "generatingFollowUp") return
    const submitted = {
      ...submittedBase,
      question: {
        ...submittedBase.question,
        referenceAnswer: generating.question.referenceAnswer,
      },
      version: 4,
    }
    let referenceRefreshCount = 0

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/questions/reference-answer`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 2, questionId })
        return jsonResponse(generating)
      }
      if (path === `/api/practice/sessions/${sessionId}/questions/reference-answer/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 3, questionId })
        referenceRefreshCount += 1
        return jsonResponse(generating)
      }
      if (path === `/api/practice/sessions/${sessionId}/answers/main`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({
          content: "用户仍可提交的回答。",
          questionId,
          version: 3,
        })
        return jsonResponse(submitted)
      }
      if (path === `/api/practice/sessions/${sessionId}/follow-up-generation/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({ version: 4 })
        return jsonResponse(submitted)
      }
      throw new Error(`Unexpected request during submit-before-reference-worker workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await user.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.referenceAnswer.request"),
      }),
    )
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.referenceAnswer.confirm"),
      }),
    )
    expect(
      await testing.screen.findByText(i18n.t("practice.referenceAnswer.generating")),
    ).toBeVisible()
    await testing.waitFor(() => expect(referenceRefreshCount).toBeGreaterThan(0))

    await user.type(
      await testing.screen.findByLabelText(i18n.t("practice.answer.label")),
      "用户仍可提交的回答。",
    )
    await user.click(testing.screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))
    expect(await testing.screen.findByTestId("practice-generating-follow-up-state")).toBeVisible()

    const refreshCountAfterSubmit = referenceRefreshCount
    await new Promise((resolve) => setTimeout(resolve, 650))
    expect(referenceRefreshCount).toBe(refreshCountAfterSubmit)
  })

  it("reveals follow-up hint and framework with consecutive versions", async () => {
    const user = userEvent.setup()
    const current = session("answeringFollowUp", 4)
    if (current.status !== "answeringFollowUp") return
    const hinted = {
      ...current,
      currentFollowUp: {
        ...current.currentFollowUp,
        question: {
          ...current.currentFollowUp.question,
          answerHints: { content: ["补充结果指标。"], status: "revealed" as const },
        },
      },
      version: 5,
    }
    const framed = {
      ...hinted,
      currentFollowUp: {
        ...hinted.currentFollowUp,
        question: {
          ...hinted.currentFollowUp.question,
          answerFramework: {
            content: ["基线", "变化", "归因"],
            status: "revealed" as const,
          },
        },
      },
      version: 6,
    }

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/follow-ups/hint`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({
          version: 4,
          questionId,
          followUpQuestionId: followUpQuestionOneId,
        })
        return jsonResponse(hinted)
      }
      if (path === `/api/practice/sessions/${sessionId}/follow-ups/framework`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({
          version: 5,
          questionId,
          followUpQuestionId: followUpQuestionOneId,
        })
        return jsonResponse(framed)
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await user.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewHint"),
      }),
    )
    expect(await testing.screen.findByText("补充结果指标。")).toBeVisible()
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewFramework"),
      }),
    )
    expect(await testing.screen.findByText("基线")).toBeVisible()
  })

  it("requests and polls a follow-up reference answer through the real endpoints", async () => {
    const user = userEvent.setup()
    const current = session("answeringFollowUp", 4)
    if (current.status !== "answeringFollowUp") return
    const generating = {
      ...current,
      currentFollowUp: {
        ...current.currentFollowUp,
        question: {
          ...current.currentFollowUp.question,
          referenceAnswer: {
            content: null,
            status: "generating" as const,
            viewedBeforeSubmission: false,
          },
        },
      },
      version: 5,
    }
    const revealed = {
      ...generating,
      currentFollowUp: {
        ...generating.currentFollowUp,
        question: {
          ...generating.currentFollowUp.question,
          referenceAnswer: {
            content: {
              addressedGap: "补充可验证的结果证据。",
              answer: "追问参考答案中的证据补充。",
              commonMistakes: ["只重复主回答。"],
              generatedAt: "2026-08-12T08:07:00.000Z",
              keyPoints: ["给出基线。", "说明变化。"],
              kind: "personalizedSupplement" as const,
            },
            status: "revealed" as const,
            viewedBeforeSubmission: true,
          },
        },
      },
    }
    let refreshCount = 0

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
      if (path === "/api/practice/setup") return jsonResponse(setupCapabilitiesResponse())
      if (path === "/api/practice/sessions/current") return jsonResponse({ session: current })
      if (path === `/api/practice/sessions/${sessionId}/follow-ups/reference-answer`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({
          followUpQuestionId: followUpQuestionOneId,
          questionId,
          version: 4,
        })
        return jsonResponse(generating)
      }
      if (path === `/api/practice/sessions/${sessionId}/follow-ups/reference-answer/refresh`) {
        expect(init?.method).toBe("POST")
        expect(requestBody([input, init])).toEqual({
          followUpQuestionId: followUpQuestionOneId,
          questionId,
          version: 5,
        })
        refreshCount += 1
        return jsonResponse(refreshCount === 1 ? generating : revealed)
      }
      throw new Error(`Unexpected request during follow-up reference answer workflow: ${path}`)
    })

    renderWithProviders(<PracticePage />, { router: { initialEntries: ["/practice"] } })

    await user.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewReference"),
      }),
    )
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.confirm"),
      }),
    )

    expect(await testing.screen.findByText("补充可验证的结果证据。")).toBeVisible()
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith("/follow-ups/reference-answer"),
      ),
    ).toHaveLength(1)
    const refreshCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/follow-ups/reference-answer/refresh"),
    )
    expect(refreshCalls.length).toBeGreaterThanOrEqual(2)
    for (const [input, init] of refreshCalls) {
      expect(requestBody([input, init])).toEqual({
        followUpQuestionId: followUpQuestionOneId,
        questionId,
        version: 5,
      })
    }
  })
})
