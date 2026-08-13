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
    const mainSubmitted = session("generatingFollowUp", 3)
    const firstFollowUpReady = session("answeringFollowUp", 4)
    const firstAnswerSubmitted = session("generatingFollowUp", 5)
    const secondFollowUpReady = session("answeringFollowUp", 6)
    const answerSubmitted = evaluating(7)
    const finalReview = review(8)

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
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

  it("continues from review through the real next-question generation poll", async () => {
    const user = userEvent.setup()
    const current = review(8)
    const nextGenerating = nextQuestionSession("generatingQuestion", 9)
    const nextAnswering = nextQuestionSession("answering", 10)
    let generationRefreshCount = 0

    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/roles") return jsonResponse(rolesResponse())
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
})
