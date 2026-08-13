import * as testing from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"

import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: active session workflow", () => {
  it("moves from setup through start and polling to the API question card", async () => {
    const user = userEvent.setup()
    const setup = api.createPracticeMockResponse("setupReady")
    const generating = api.createPracticeMockResponse("generatingQuestion")
    const answering = api.createPracticeMockResponse("answeringQuestion")
    if (
      setup.session.status !== "setup" ||
      generating.session.status !== "generatingQuestion" ||
      answering.session.status !== "answering"
    ) {
      throw new Error("Setup, generating, and answering fixtures are required.")
    }
    const targetRoleId = setup.session.selection.targetRoleId
    if (!targetRoleId) throw new Error("A setup target role is required.")
    const selection = { ...setup.session.selection, targetRoleId }
    generating.session.selection = structuredClone(selection)
    answering.session.sessionId = generating.session.sessionId
    answering.session.version = generating.session.version + 1
    answering.session.selection = structuredClone(selection)
    answering.session.startedAt = generating.session.startedAt

    vi.mocked(api.getPracticePage).mockResolvedValue(setup)
    vi.mocked(api.startPracticeSession).mockResolvedValue(generating.session)
    vi.mocked(api.getQuestionGenerationStatus).mockResolvedValue(answering.session)

    context.renderPracticePage()

    expect(await testing.screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    await user.click(testing.screen.getByRole("button", { name: i18n.t("practice.actions.start") }))

    expect(await testing.screen.findByTestId("practice-generating-state")).toBeInTheDocument()
    expect(await testing.screen.findByTestId("practice-answering-state")).toHaveTextContent(
      answering.session.question.prompt,
    )
    expect(vi.mocked(api.startPracticeSession).mock.calls[0]?.[0]).toEqual(selection)
    expect(api.getQuestionGenerationStatus).toHaveBeenCalledWith({
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    })
  })

  it("restores an answering session on browser-refresh-style page reload", async () => {
    const answering = api.createPracticeMockResponse("answeringQuestion")
    if (answering.session.status !== "answering") {
      throw new Error("Answering fixture is required.")
    }
    vi.mocked(api.getPracticePage).mockResolvedValue(answering)

    context.renderPracticePage()

    expect(await testing.screen.findByTestId("practice-answering-state")).toHaveTextContent(
      answering.session.question.prompt,
    )
    expect(api.startPracticeSession).not.toHaveBeenCalled()
    expect(api.getQuestionGenerationStatus).not.toHaveBeenCalled()
  })

  it("runs the real-shaped main and follow-up workflow through evaluation", async () => {
    const user = userEvent.setup()
    const initial = api.createPracticeMockResponse("answeringQuestion")
    const firstFollowUp = api.createPracticeMockResponse("answeringFirstFollowUp")
    const secondFollowUp = api.createPracticeMockResponse("answeringFollowUp")
    const evaluating = api.createPracticeMockResponse("evaluatingAnswer")
    const review = api.createPracticeMockResponse("reviewBalanced")
    if (
      initial.session.status !== "answering" ||
      firstFollowUp.session.status !== "answeringFollowUp" ||
      secondFollowUp.session.status !== "answeringFollowUp" ||
      evaluating.session.status !== "evaluating" ||
      review.session.status !== "review"
    ) {
      throw new Error("The complete practice workflow fixtures are required.")
    }

    const initialSession = initial.session
    const firstFollowUpSession = firstFollowUp.session
    const secondFollowUpSession = secondFollowUp.session
    if (
      initialSession.status !== "answering" ||
      firstFollowUpSession.status !== "answeringFollowUp" ||
      secondFollowUpSession.status !== "answeringFollowUp"
    ) {
      throw new Error("The answering workflow fixtures are required.")
    }

    const sessionId = initialSession.sessionId
    const questionId = initialSession.question.id
    const makeGeneratingFollowUp = (source: typeof firstFollowUpSession, version: number) => {
      const { currentFollowUp: _currentFollowUp, ...withoutCurrentFollowUp } = source
      return {
        ...withoutCurrentFollowUp,
        question: initialSession.question,
        sessionId,
        status: "generatingFollowUp" as const,
        version,
      }
    }

    const firstGenerating = makeGeneratingFollowUp(firstFollowUpSession, initialSession.version + 1)
    const firstAnswering = {
      ...firstFollowUpSession,
      question: initialSession.question,
      sessionId,
      version: firstGenerating.version + 1,
    }
    const secondGenerating = makeGeneratingFollowUp(
      secondFollowUpSession,
      firstAnswering.version + 1,
    )
    const secondAnswering = {
      ...secondFollowUpSession,
      question: initialSession.question,
      sessionId,
      version: secondGenerating.version + 1,
    }
    const evaluatingPending = {
      ...evaluating.session,
      question: initialSession.question,
      sessionId,
      version: secondAnswering.version + 1,
    }
    const finalReview = {
      ...review.session,
      followUpCompletion: { status: "completed" as const, reason: "allAnswered" as const },
      followUpExchanges: secondAnswering.followUpExchanges,
      question: initialSession.question,
      sessionId,
      version: evaluatingPending.version + 1,
    }

    vi.mocked(api.getPracticePage).mockResolvedValue(initial)
    vi.mocked(api.submitPrimaryAnswer).mockResolvedValue(firstGenerating)
    vi.mocked(api.getFollowUpGenerationStatus)
      .mockResolvedValueOnce(firstAnswering)
      .mockResolvedValueOnce(secondAnswering)
    vi.mocked(api.submitFollowUpAnswer)
      .mockResolvedValueOnce(secondGenerating)
      .mockResolvedValueOnce(evaluatingPending)
    vi.mocked(api.getPracticeEvaluationStatus)
      .mockResolvedValueOnce(evaluatingPending)
      .mockResolvedValueOnce(finalReview)

    context.renderPracticePage()

    await user.type(
      await testing.screen.findByLabelText(i18n.t("practice.answer.label")),
      "主回答中的个人行动与结果。",
    )
    await user.click(testing.screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))
    expect(await testing.screen.findByTestId("practice-generating-follow-up-state")).toBeVisible()
    expect(await testing.screen.findByTestId("practice-answering-follow-up-state")).toBeVisible()

    await user.type(
      testing.screen.getByLabelText(i18n.t("practice.followUp.answerLabel")),
      "第一轮追问的证据。",
    )
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }),
    )
    expect(await testing.screen.findByTestId("practice-generating-follow-up-state")).toBeVisible()
    expect(await testing.screen.findByTestId("practice-answering-follow-up-state")).toBeVisible()

    await user.type(
      testing.screen.getByLabelText(i18n.t("practice.followUp.answerLabel")),
      "第二轮追问的风险控制。",
    )
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }),
    )
    expect(await testing.screen.findByTestId("practice-evaluating-state")).toBeVisible()
    expect(
      await testing.screen.findByTestId("practice-review-state", {}, { timeout: 3_000 }),
    ).toHaveTextContent(String(finalReview.evaluation.overallScore))
    expect(testing.screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(
      secondAnswering.followUpExchanges[0]?.answer.content ?? "",
    )
    expect(api.getFollowUpGenerationStatus).toHaveBeenCalledTimes(2)
    expect(api.getPracticeEvaluationStatus).toHaveBeenCalledTimes(2)
    expect(api.retryPracticeEvaluation).not.toHaveBeenCalled()
    expect(vi.mocked(api.submitPrimaryAnswer).mock.calls[0]?.[0]).toEqual({
      content: "主回答中的个人行动与结果。",
      questionId,
      sessionId,
      version: initialSession.version,
    })
  })
})
