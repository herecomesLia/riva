import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createPracticeMockResponse, createPracticeReferenceAnswer } from "@/mocks/data/practice"
import type { PracticePageResponse } from "@/models/practice"
import { PracticePage } from "@/pages/practice"
import { synchronizePracticeSessionMutationResponse } from "@/pages/practice/practice-cache"
import {
  endPracticeFollowUps,
  getPracticePage,
  getPracticeEvaluationStatus,
  getQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
  retryPracticeEvaluation,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  endPracticeSession,
  prepareNextPracticeSession,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
} from "@/services/practice"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/practice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/practice")>()),
  getPracticePage: vi.fn(),
  getPracticeEvaluationStatus: vi.fn(),
  getQuestionGenerationStatus: vi.fn(),
  endPracticeFollowUps: vi.fn(),
  requestAnswerFramework: vi.fn(),
  requestEndPracticeSession: vi.fn(),
  requestPracticeHint: vi.fn(),
  requestPracticeReferenceAnswer: vi.fn(),
  retryPracticeEvaluation: vi.fn(),
  retryCurrentPracticeQuestion: vi.fn(),
  continueToNextPracticeQuestion: vi.fn(),
  endPracticeSession: vi.fn(),
  prepareNextPracticeSession: vi.fn(),
  setQuestionSaved: vi.fn(),
  setQuestionWeak: vi.fn(),
  skipPracticeQuestion: vi.fn(),
  startPracticeSession: vi.fn(),
  submitFollowUpAnswer: vi.fn(),
  submitPrimaryAnswer: vi.fn(),
}))

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function renderPracticePage() {
  return renderWithProviders(<PracticePage />, {
    router: { initialEntries: ["/practice"] },
  })
}

describe("PracticePage", () => {
  it("accepts only a newer completed response for the same session-ending request", () => {
    const current = createPracticeMockResponse("reviewBalanced")
    const completed = createPracticeMockResponse("completedSession")
    if (current.session.status !== "review" || completed.session.status !== "completed") return
    completed.session.sessionId = current.session.sessionId
    completed.session.version = current.session.version + 1
    const request = { sessionId: current.session.sessionId, version: current.session.version }
    expect(synchronizePracticeSessionMutationResponse(current, completed, request)).toBe(completed)
    completed.session.version = current.session.version
    expect(synchronizePracticeSessionMutationResponse(current, completed, request)).toBe(current)
    completed.session.version = current.session.version + 1
    completed.session.sessionId = "other_session"
    expect(synchronizePracticeSessionMutationResponse(current, completed, request)).toBe(current)
  })
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getPracticePage).mockReset()
    vi.mocked(getPracticeEvaluationStatus).mockReset()
    vi.mocked(getQuestionGenerationStatus).mockReset()
    vi.mocked(endPracticeFollowUps).mockReset()
    vi.mocked(requestAnswerFramework).mockReset()
    vi.mocked(requestEndPracticeSession).mockReset()
    vi.mocked(requestPracticeHint).mockReset()
    vi.mocked(requestPracticeReferenceAnswer).mockReset()
    vi.mocked(retryPracticeEvaluation).mockReset()
    vi.mocked(retryCurrentPracticeQuestion).mockReset()
    vi.mocked(continueToNextPracticeQuestion).mockReset()
    vi.mocked(endPracticeSession).mockReset()
    vi.mocked(prepareNextPracticeSession).mockReset()
    vi.mocked(setQuestionSaved).mockReset()
    vi.mocked(setQuestionWeak).mockReset()
    vi.mocked(skipPracticeQuestion).mockReset()
    vi.mocked(startPracticeSession).mockReset()
    vi.mocked(submitFollowUpAnswer).mockReset()
    vi.mocked(submitPrimaryAnswer).mockReset()
  })

  it("shows structured loading content while setup data is pending", async () => {
    vi.mocked(getPracticePage).mockReturnValue(new Promise(() => undefined))

    renderPracticePage()

    expect(
      await screen.findByRole("heading", { name: i18n.t("practice.title") }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: i18n.t("practice.setup.title") }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("practice-loading-state")).toBeInTheDocument()
  })

  it("confirms, locks, preserves the draft, and applies the reference-answer snapshot", async () => {
    const initial = createPracticeMockResponse("answeringQuestion")
    if (initial.session.status !== "answering") throw new Error("Answering fixture required.")
    const revealed = structuredClone(initial)
    if (revealed.session.status !== "answering") throw new Error("Answering fixture required.")
    const revealedSession = revealed.session
    revealedSession.version += 1
    revealedSession.question.referenceAnswer = {
      status: "revealed",
      content: createPracticeReferenceAnswer({
        templateId: initial.session.question.templateId,
        questionType: initial.session.question.questionType,
        targetRoleTitle: "Senior Frontend Engineer",
        questionPrompt: initial.session.question.prompt,
        recommendedMaterials: initial.session.question.recommendedMaterials,
      }),
      viewedBeforeSubmission: true,
    }
    const request = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(initial)
    vi.mocked(requestPracticeReferenceAnswer).mockReturnValue(request.promise)
    const user = userEvent.setup()
    renderPracticePage()

    const textbox = await screen.findByRole("textbox")
    const submitButton = screen.getByRole("button", { name: i18n.t("practice.answer.submit") })
    await user.type(textbox, "保留这份草稿")
    expect(screen.queryByText(revealedSession.question.referenceAnswer.content.answer)).toBeNull()
    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.request") }),
    )
    expect(requestPracticeReferenceAnswer).not.toHaveBeenCalled()
    const dialog = screen.getByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", {
      name: i18n.t("practice.referenceAnswer.confirm"),
    })
    await user.click(confirm)
    expect(requestPracticeReferenceAnswer).toHaveBeenCalledTimes(1)
    expect(vi.mocked(requestPracticeReferenceAnswer).mock.calls[0]?.[0]).toEqual({
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    })
    expect(submitButton).toBeDisabled()

    request.resolve(revealed)
    expect(
      await screen.findByText(revealedSession.question.referenceAnswer.content.answer),
    ).toBeVisible()
    expect(textbox).toHaveValue("保留这份草稿")
  })

  it("shows a safe load error and retries", async () => {
    const user = userEvent.setup()
    vi.mocked(getPracticePage)
      .mockRejectedValueOnce(new Error("unsafe load details"))
      .mockResolvedValueOnce(createPracticeMockResponse("setupReady"))

    renderPracticePage()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(i18n.t("common.pageState.error.title"))
    expect(alert).not.toHaveTextContent("unsafe load details")
    await user.click(screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }))

    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
  })

  it("polls question generation into an answering snapshot", async () => {
    const generating = createPracticeMockResponse("generatingQuestion")
    const answering = createPracticeMockResponse("answeringQuestion")
    vi.mocked(getPracticePage).mockResolvedValue(generating)
    vi.mocked(getQuestionGenerationStatus).mockResolvedValue(answering)

    renderPracticePage()

    expect(await screen.findByTestId("practice-answering-state")).toHaveTextContent(
      answering.session.status === "answering" ? answering.session.question.prompt : "",
    )
    expect(getQuestionGenerationStatus).toHaveBeenCalledWith({
      sessionId:
        generating.session.status === "generatingQuestion" ? generating.session.sessionId : "",
      version: generating.session.status === "generatingQuestion" ? generating.session.version : 0,
    })
  })

  it("retries a failed generation query without creating a new session", async () => {
    const user = userEvent.setup()
    const generating = createPracticeMockResponse("generatingQuestion")
    const answering = createPracticeMockResponse("answeringQuestion")
    if (
      generating.session.status !== "generatingQuestion" ||
      answering.session.status !== "answering"
    ) {
      throw new Error("Generating and answering fixtures are required.")
    }
    generating.session.selection.difficulty = "pressure"
    answering.session.sessionId = generating.session.sessionId
    answering.session.version = generating.session.version + 1
    answering.session.selection = structuredClone(generating.session.selection)
    answering.session.startedAt = generating.session.startedAt
    const retryQuery = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(generating)
    vi.mocked(getQuestionGenerationStatus)
      .mockRejectedValueOnce(new Error("unsafe generation details"))
      .mockReturnValueOnce(retryQuery.promise)

    renderPracticePage()

    const errorState = await screen.findByTestId("practice-generation-error-state")
    expect(errorState).toHaveTextContent(i18n.t("practice.difficulty.pressure"))
    expect(errorState).not.toHaveTextContent("unsafe generation details")
    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.actions.retryGeneration") }),
    )
    expect(
      screen.getByRole("button", { name: i18n.t("practice.actions.retryingGeneration") }),
    ).toBeDisabled()

    const expectedInput = {
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    }
    await waitFor(() => expect(getQuestionGenerationStatus).toHaveBeenCalledTimes(2))
    expect(vi.mocked(getQuestionGenerationStatus).mock.calls).toEqual([
      [expectedInput],
      [expectedInput],
    ])
    expect(startPracticeSession).not.toHaveBeenCalled()
    await act(async () => {
      retryQuery.resolve(answering)
      await retryQuery.promise
    })
    expect(await screen.findByTestId("practice-answering-state")).toBeInTheDocument()
    expect(answering.session.sessionId).toBe(generating.session.sessionId)
    expect(answering.session.selection).toEqual(generating.session.selection)
    expect(answering.session.startedAt).toBe(generating.session.startedAt)
  })

  it("does not let a stale poll response overwrite a newer session", async () => {
    const first = createPracticeMockResponse("generatingQuestion")
    const second = createPracticeMockResponse("generatingQuestion")
    const oldAnswering = createPracticeMockResponse("answeringQuestion")
    if (
      first.session.status !== "generatingQuestion" ||
      second.session.status !== "generatingQuestion" ||
      oldAnswering.session.status !== "answering"
    ) {
      throw new Error("Expected generating and answering fixtures.")
    }
    second.session.sessionId = "practice_session_newer"
    second.session.selection.difficulty = "pressure"
    oldAnswering.session.sessionId = first.session.sessionId
    oldAnswering.session.version = first.session.version + 1
    const firstPoll = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(first)
    vi.mocked(getQuestionGenerationStatus)
      .mockReturnValueOnce(firstPoll.promise)
      .mockReturnValue(new Promise(() => undefined))
    const renderResult = renderPracticePage()

    expect(await screen.findByTestId("practice-generating-state")).toBeInTheDocument()
    await waitFor(() => expect(getQuestionGenerationStatus).toHaveBeenCalledTimes(1))
    act(() => {
      renderResult.queryClient.setQueryData(["practice"], second)
    })
    await act(async () => {
      firstPoll.resolve(oldAnswering)
      await firstPoll.promise
    })

    expect(renderResult.queryClient.getQueryData(["practice"])).toEqual(second)
    await waitFor(() =>
      expect(screen.getByTestId("practice-generating-state")).toHaveTextContent(
        i18n.t("practice.difficulty.pressure"),
      ),
    )
  })

  it("polls an evaluating snapshot into a review without calculating scores locally", async () => {
    const evaluating = createPracticeMockResponse("evaluatingAnswer")
    const review = createPracticeMockResponse("reviewBalanced")
    if (evaluating.session.status !== "evaluating" || review.session.status !== "review") {
      throw new Error("Evaluating and review fixtures are required.")
    }
    review.session.version = evaluating.session.version + 1
    vi.mocked(getPracticePage).mockResolvedValue(evaluating)
    vi.mocked(getPracticeEvaluationStatus).mockResolvedValue(review)

    renderPracticePage()

    expect(await screen.findByTestId("practice-review-state")).toHaveTextContent(
      String(review.session.evaluation.overallScore),
    )
    expect(getPracticeEvaluationStatus).toHaveBeenCalledWith({
      sessionId: evaluating.session.sessionId,
      version: evaluating.session.version,
      questionId: evaluating.session.question.id,
    })
  })

  it("retries failed evaluation with a new version while preserving the conversation", async () => {
    const evaluating = createPracticeMockResponse("evaluatingAnswer")
    if (evaluating.session.status !== "evaluating") {
      throw new Error("An evaluating fixture is required.")
    }
    const retried = structuredClone(evaluating)
    if (retried.session.status !== "evaluating") return
    retried.session.version += 1
    const nextPoll = createDeferred<PracticePageResponse>()
    const retryAttempt = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(evaluating)
    vi.mocked(getPracticeEvaluationStatus)
      .mockRejectedValueOnce(new Error("unsafe evaluation prompt and stack"))
      .mockReturnValueOnce(nextPoll.promise)
    vi.mocked(retryPracticeEvaluation).mockReturnValue(retryAttempt.promise)

    renderPracticePage()

    const error = await screen.findByTestId("practice-evaluation-error")
    expect(error).toHaveTextContent(i18n.t("practice.errors.evaluationDescription"))
    expect(error).not.toHaveTextContent("unsafe evaluation prompt and stack")
    expect(screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(
      evaluating.session.mainAnswer.content,
    )
    const retryButton = screen.getByRole("button", { name: i18n.t("practice.evaluating.retry") })
    act(() => {
      fireEvent.click(retryButton)
      fireEvent.click(retryButton)
    })

    const retryingButton = await screen.findByRole("button", {
      name: i18n.t("practice.evaluating.retrying"),
    })
    expect(retryingButton).toBeDisabled()
    expect(retryPracticeEvaluation).toHaveBeenCalledOnce()
    expect(vi.mocked(retryPracticeEvaluation).mock.calls[0]?.[0]).toEqual({
      sessionId: evaluating.session.sessionId,
      version: evaluating.session.version,
      questionId: evaluating.session.question.id,
    })
    await act(async () => {
      retryAttempt.resolve(retried)
      await retryAttempt.promise
    })
    await waitFor(() => expect(getPracticeEvaluationStatus).toHaveBeenCalledTimes(2))
    expect(vi.mocked(getPracticeEvaluationStatus).mock.calls[1]?.[0]).toEqual({
      sessionId: retried.session.sessionId,
      version: retried.session.version,
      questionId: retried.session.question.id,
    })
    expect(screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(
      evaluating.session.mainAnswer.content,
    )
  })

  it("does not let a stale evaluation response overwrite a newer answer attempt", async () => {
    const evaluating = createPracticeMockResponse("evaluatingAnswer")
    const staleReview = createPracticeMockResponse("reviewBalanced")
    const newer = createPracticeMockResponse("evaluatingNoFollowUp")
    if (
      evaluating.session.status !== "evaluating" ||
      staleReview.session.status !== "review" ||
      newer.session.status !== "evaluating"
    ) {
      throw new Error("Evaluation fixtures are required.")
    }
    staleReview.session.sessionId = evaluating.session.sessionId
    staleReview.session.version = evaluating.session.version + 1
    newer.session.sessionId = "practice_session_new_answer_attempt"
    newer.session.version = evaluating.session.version + 2
    const poll = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(evaluating)
    vi.mocked(getPracticeEvaluationStatus)
      .mockReturnValueOnce(poll.promise)
      .mockReturnValue(new Promise(() => undefined))
    const renderResult = renderPracticePage()

    expect(await screen.findByTestId("practice-evaluating-state")).toBeInTheDocument()
    await waitFor(() => expect(getPracticeEvaluationStatus).toHaveBeenCalledTimes(1))
    act(() => {
      renderResult.queryClient.setQueryData(["practice"], newer)
    })
    await act(async () => {
      poll.resolve(staleReview)
      await poll.promise
    })

    expect(renderResult.queryClient.getQueryData(["practice"])).toEqual(newer)
    expect(screen.queryByTestId("practice-review-state")).not.toBeInTheDocument()
  })

  it("updates review saved state only from the returned service snapshot", async () => {
    const user = userEvent.setup()
    const review = createPracticeMockResponse("reviewBalanced")
    const saved = structuredClone(review)
    if (review.session.status !== "review" || saved.session.status !== "review") {
      throw new Error("Review fixtures are required.")
    }
    saved.session.version += 1
    saved.session.question.isSaved = true
    vi.mocked(getPracticePage).mockResolvedValue(review)
    vi.mocked(setQuestionSaved).mockResolvedValue(saved)

    renderPracticePage()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.questionActions.save") }),
    )
    expect(vi.mocked(setQuestionSaved).mock.calls[0]?.[0]).toEqual({
      sessionId: review.session.sessionId,
      version: review.session.version,
      questionId: review.session.question.id,
      isSaved: true,
    })
    expect(
      await screen.findByRole("button", { name: i18n.t("practice.questionActions.unsave") }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("synchronously locks duplicate retry-current clicks", async () => {
    const review = createPracticeMockResponse("reviewBalanced")
    const retrying = createPracticeMockResponse("retryingCurrentQuestion")
    if (review.session.status !== "review" || retrying.session.status !== "answering") return
    retrying.session.sessionId = review.session.sessionId
    retrying.session.version = review.session.version + 1
    const deferred = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(review)
    vi.mocked(retryCurrentPracticeQuestion).mockReturnValue(deferred.promise)
    renderPracticePage()
    const retryButton = await screen.findByRole("button", { name: /重练当前题/i })
    act(() => {
      fireEvent.click(retryButton)
      fireEvent.click(retryButton)
    })
    await waitFor(() => expect(retryCurrentPracticeQuestion).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    await act(async () => {
      deferred.resolve(retrying)
      await deferred.promise
    })
    expect(await screen.findByTestId("practice-answering-state")).toBeInTheDocument()
  })

  it("synchronously locks duplicate next-question clicks", async () => {
    const review = createPracticeMockResponse("reviewBalanced")
    const generating = createPracticeMockResponse("generatingNextQuestion")
    if (review.session.status !== "review" || generating.session.status !== "generatingQuestion")
      return
    generating.session.sessionId = review.session.sessionId
    generating.session.version = review.session.version + 1
    const deferred = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(review)
    vi.mocked(getQuestionGenerationStatus).mockResolvedValue(generating)
    vi.mocked(continueToNextPracticeQuestion).mockReturnValue(deferred.promise)
    renderPracticePage()
    const nextButton = await screen.findByRole("button", { name: /继续下一题/i })
    act(() => {
      fireEvent.click(nextButton)
      fireEvent.click(nextButton)
    })
    await waitFor(() => expect(continueToNextPracticeQuestion).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    await act(async () => {
      deferred.resolve(generating)
      await deferred.promise
    })
    expect(await screen.findByTestId("practice-generating-state")).toBeInTheDocument()
  })

  it("synchronously locks duplicate end confirmations", async () => {
    const user = userEvent.setup()
    const review = createPracticeMockResponse("reviewBalanced")
    const completed = createPracticeMockResponse("completedSession")
    if (review.session.status !== "review" || completed.session.status !== "completed") return
    completed.session.sessionId = review.session.sessionId
    completed.session.version = review.session.version + 1
    const deferred = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(review)
    vi.mocked(endPracticeSession).mockReturnValue(deferred.promise)
    renderPracticePage()
    await user.click(await screen.findByRole("button", { name: /结束本轮练习/i }))
    const confirm = screen.getAllByRole("button", { name: /结束本轮练习/i }).at(-1)!
    act(() => {
      fireEvent.click(confirm)
      fireEvent.click(confirm)
    })
    await waitFor(() => expect(endPracticeSession).toHaveBeenCalledTimes(1))
    await act(async () => {
      deferred.resolve(completed)
      await deferred.promise
    })
    expect(await screen.findByTestId("practice-completed-state")).toBeInTheDocument()
  })

  it("prepares the next round from the completed snapshot and restores the saved setup", async () => {
    const user = userEvent.setup()
    const completed = createPracticeMockResponse("completedSession")
    const prepared = createPracticeMockResponse("setupReady")
    if (completed.session.status !== "completed" || prepared.session.status !== "setup") return
    completed.session.selection = {
      ...completed.session.selection,
      difficulty: "pressure",
      questionType: "behavioral",
      prioritizeWeaknesses: true,
      source: "saved",
    }
    prepared.setupContext = structuredClone(completed.setupContext)
    prepared.session.selection = structuredClone(completed.session.selection)
    vi.mocked(getPracticePage).mockResolvedValue(completed)
    vi.mocked(prepareNextPracticeSession).mockResolvedValue(prepared)
    const result = renderPracticePage()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.completed.startNextRound") }),
    )

    expect(vi.mocked(prepareNextPracticeSession).mock.calls[0]?.[0]).toEqual({
      sessionId: completed.session.sessionId,
      version: completed.session.version,
    })
    expect(result.queryClient.getQueryData(["practice"])).toEqual(prepared)
    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    expect(screen.getByTestId("practice-target-role-trigger")).toHaveTextContent(
      completed.setupContext.targetRoles.find(
        (role) => role.id === completed.session.selection.targetRoleId,
      )?.title ?? "",
    )
    expect(
      screen.getByRole("button", {
        name: i18n.t(`practice.questionTypes.${completed.session.selection.questionType}`),
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", {
        name: i18n.t(`practice.difficulty.${completed.session.selection.difficulty}`),
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", {
        name: i18n.t(`practice.sources.${completed.session.selection.source}`),
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("switch", { name: i18n.t("practice.setup.fields.prioritizeWeaknesses") }),
    ).toBeChecked()
    expect(screen.queryByTestId("practice-completed-state")).not.toBeInTheDocument()
  })

  it("synchronously prevents duplicate prepare-next-round requests", async () => {
    const completed = createPracticeMockResponse("completedSession")
    const prepared = createPracticeMockResponse("setupReady")
    if (completed.session.status !== "completed") return
    const deferred = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(completed)
    vi.mocked(prepareNextPracticeSession).mockReturnValue(deferred.promise)
    renderPracticePage()

    const startNextRound = await screen.findByRole("button", {
      name: i18n.t("practice.completed.startNextRound"),
    })
    act(() => {
      fireEvent.click(startNextRound)
      fireEvent.click(startNextRound)
    })

    await waitFor(() => expect(prepareNextPracticeSession).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    await act(async () => {
      deferred.resolve(prepared)
      await deferred.promise
    })
    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
  })

  it("shows a pending next-round action and disables both completed actions", async () => {
    const completed = createPracticeMockResponse("completedSession")
    const deferred = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(completed)
    vi.mocked(prepareNextPracticeSession).mockReturnValue(deferred.promise)
    renderPracticePage()

    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("practice.completed.startNextRound") }),
    )

    expect(
      await screen.findByRole("button", { name: i18n.t("practice.completed.preparingNextRound") }),
    ).toBeDisabled()
    expect(
      screen.getByTestId("practice-completed-state").querySelector('[data-slot="spinner"]'),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.completed.viewHistory") }),
    ).toHaveAttribute("aria-disabled", "true")
    expect(prepareNextPracticeSession).toHaveBeenCalledOnce()
  })

  it("shows a safe error and allows retrying the next-round preparation", async () => {
    const user = userEvent.setup()
    const completed = createPracticeMockResponse("completedSession")
    const internalError = "internal session practice_session_01 version 99 stack"
    vi.mocked(getPracticePage).mockResolvedValue(completed)
    vi.mocked(prepareNextPracticeSession)
      .mockRejectedValueOnce(new Error(internalError))
      .mockResolvedValueOnce("ignored")
    renderPracticePage()

    const startNextRound = await screen.findByRole("button", {
      name: i18n.t("practice.completed.startNextRound"),
    })
    await user.click(startNextRound)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(i18n.t("practice.errors.prepareNextRoundTitle"))
    expect(alert).toHaveTextContent(i18n.t("practice.errors.prepareNextRoundDescription"))
    expect(alert).not.toHaveTextContent(internalError)
    expect(screen.getByTestId("practice-completed-state")).toBeInTheDocument()
    expect(startNextRound).toBeEnabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.completed.viewHistory") }),
    ).not.toHaveAttribute("aria-disabled")

    await user.click(startNextRound)
    expect(prepareNextPracticeSession).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByTestId("practice-completed-state")).toBeInTheDocument()
  })

  it("navigates to the existing training-history page without preparing another round", async () => {
    const user = userEvent.setup()
    vi.mocked(getPracticePage).mockResolvedValue(createPracticeMockResponse("completedSession"))
    const { router } = renderPracticePage()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.completed.viewHistory") }),
    )

    await waitFor(() => expect(router?.state.location.pathname).toBe("/history"))
    expect(prepareNextPracticeSession).not.toHaveBeenCalled()
  })

  it("locks every review action while next-question is pending", async () => {
    const review = createPracticeMockResponse("reviewBalanced")
    const generating = createPracticeMockResponse("generatingNextQuestion")
    const deferred = createDeferred<PracticePageResponse>()
    if (review.session.status !== "review" || generating.session.status !== "generatingQuestion")
      return
    generating.session.sessionId = review.session.sessionId
    generating.session.version = review.session.version + 1
    vi.mocked(getPracticePage).mockResolvedValue(review)
    vi.mocked(getQuestionGenerationStatus).mockResolvedValue(generating)
    vi.mocked(continueToNextPracticeQuestion).mockReturnValue(deferred.promise)
    renderPracticePage()
    const nextButton = await screen.findByRole("button", { name: /继续下一题/i })
    const retryButton = screen.getByRole("button", { name: /重练当前题/i })
    const endButton = screen.getByRole("button", { name: /结束本轮练习/i })
    const savedButton = screen.getByRole("button", { name: /收藏题目/i })
    const weakButton = screen.getByRole("button", { name: /标记(为)?薄弱题/i })
    act(() => {
      fireEvent.click(nextButton)
      fireEvent.click(retryButton)
      fireEvent.click(endButton)
      fireEvent.click(savedButton)
      fireEvent.click(weakButton)
    })
    await waitFor(() => expect(continueToNextPracticeQuestion).toHaveBeenCalledTimes(1))
    for (const name of [/重练当前题/i, /结束本轮练习/i, /收藏题目/i, /标记(为)?薄弱题/i]) {
      for (const button of screen.getAllByRole("button", { hidden: true, name })) {
        expect(button).toBeDisabled()
      }
    }
    expect(retryCurrentPracticeQuestion).not.toHaveBeenCalled()
    expect(endPracticeSession).not.toHaveBeenCalled()
    expect(setQuestionSaved).not.toHaveBeenCalled()
    expect(setQuestionWeak).not.toHaveBeenCalled()
    await act(async () => {
      deferred.resolve(generating)
      await deferred.promise
    })
    expect(await screen.findByTestId("practice-generating-state")).toBeInTheDocument()
  })

  it("locks every review action while retry-current is pending", async () => {
    const review = createPracticeMockResponse("reviewBalanced")
    const retrying = createPracticeMockResponse("retryingCurrentQuestion")
    const deferred = createDeferred<PracticePageResponse>()
    if (review.session.status !== "review" || retrying.session.status !== "answering") return
    retrying.session.sessionId = review.session.sessionId
    retrying.session.version = review.session.version + 1
    vi.mocked(getPracticePage).mockResolvedValue(review)
    vi.mocked(retryCurrentPracticeQuestion).mockReturnValue(deferred.promise)
    renderPracticePage()
    const retryButton = await screen.findByRole("button", { name: /重练当前题/i })
    const nextButton = screen.getByRole("button", { name: /继续下一题/i })
    const endButton = screen.getByRole("button", { name: /结束本轮练习/i })
    const savedButton = screen.getByRole("button", { name: /收藏题目/i })
    const weakButton = screen.getByRole("button", { name: /标记(为)?薄弱题/i })
    act(() => {
      fireEvent.click(retryButton)
      fireEvent.click(nextButton)
      fireEvent.click(endButton)
      fireEvent.click(savedButton)
      fireEvent.click(weakButton)
    })
    await waitFor(() => expect(retryCurrentPracticeQuestion).toHaveBeenCalledTimes(1))
    for (const name of [/继续下一题/i, /结束本轮练习/i, /收藏题目/i, /标记(为)?薄弱题/i]) {
      for (const button of screen.getAllByRole("button", { hidden: true, name })) {
        expect(button).toBeDisabled()
      }
    }
    expect(continueToNextPracticeQuestion).not.toHaveBeenCalled()
    expect(endPracticeSession).not.toHaveBeenCalled()
    expect(setQuestionSaved).not.toHaveBeenCalled()
    expect(setQuestionWeak).not.toHaveBeenCalled()
    await act(async () => {
      deferred.resolve(retrying)
      await deferred.promise
    })
    expect(await screen.findByTestId("practice-answering-state")).toBeInTheDocument()
  })

  it("does not let a stale completed response overwrite a newer cache state", async () => {
    const user = userEvent.setup()
    const review = createPracticeMockResponse("reviewBalanced")
    const completed = createPracticeMockResponse("completedSession")
    const newer = createPracticeMockResponse("reviewBalanced")
    if (
      review.session.status !== "review" ||
      completed.session.status !== "completed" ||
      newer.session.status !== "review"
    )
      return
    completed.session.sessionId = review.session.sessionId
    completed.session.version = review.session.version + 1
    newer.session.sessionId = review.session.sessionId
    newer.session.version = review.session.version + 2
    const deferred = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(review)
    vi.mocked(endPracticeSession).mockReturnValue(deferred.promise)
    const result = renderPracticePage()
    await user.click(await screen.findByRole("button", { name: /结束本轮练习/i }))
    await user.click(screen.getAllByRole("button", { name: /结束本轮练习/i }).at(-1)!)
    act(() => result.queryClient.setQueryData(["practice"], newer))
    await act(async () => {
      deferred.resolve(completed)
      await deferred.promise
    })
    expect(result.queryClient.getQueryData(["practice"])).toEqual(newer)
    expect(screen.queryByTestId("practice-completed-state")).not.toBeInTheDocument()
  })

  it("prevents duplicate main-answer submission and enters follow-up", async () => {
    const user = userEvent.setup()
    const answering = createPracticeMockResponse("answeringQuestion")
    const following = createPracticeMockResponse("answeringFirstFollowUp")
    if (
      answering.session.status !== "answering" ||
      following.session.status !== "answeringFollowUp"
    ) {
      throw new Error("Answering and follow-up fixtures are required.")
    }
    following.session.version = answering.session.version + 1
    const submission = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(answering)
    vi.mocked(submitPrimaryAnswer).mockReturnValue(submission.promise)

    renderPracticePage()

    await user.type(
      await screen.findByLabelText(i18n.t("practice.answer.label")),
      "我负责定位问题并推动方案落地。",
    )
    await user.click(screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))
    const pendingButton = await screen.findByRole("button", {
      name: i18n.t("practice.answer.submitting"),
    })
    expect(pendingButton).toBeDisabled()
    expect(screen.getByLabelText(i18n.t("practice.answer.label"))).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.guidance.requestHint") }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.guidance.requestFramework") }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionActions.save") }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionActions.markWeak") }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionActions.skip") }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionActions.end") }),
    ).toBeDisabled()
    await user.click(pendingButton)
    expect(submitPrimaryAnswer).toHaveBeenCalledTimes(1)
    expect(requestPracticeHint).not.toHaveBeenCalled()
    expect(requestAnswerFramework).not.toHaveBeenCalled()
    expect(setQuestionSaved).not.toHaveBeenCalled()
    expect(setQuestionWeak).not.toHaveBeenCalled()
    expect(skipPracticeQuestion).not.toHaveBeenCalled()
    expect(requestEndPracticeSession).not.toHaveBeenCalled()

    await act(async () => {
      submission.resolve(following)
      await submission.promise
    })
    expect(await screen.findByTestId("practice-answering-follow-up-state")).toBeInTheDocument()
  })

  it("locks every versioned action while a hint request is pending", async () => {
    const user = userEvent.setup()
    const answering = createPracticeMockResponse("answeringQuestion")
    const hinted = createPracticeMockResponse("answeringHintRevealed")
    if (answering.session.status !== "answering" || hinted.session.status !== "answering") {
      throw new Error("Answering fixtures are required.")
    }
    hinted.session.version = answering.session.version + 1
    const request = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(answering)
    vi.mocked(requestPracticeHint).mockReturnValue(request.promise)

    renderPracticePage()

    const textarea = await screen.findByLabelText(i18n.t("practice.answer.label"))
    await user.type(textarea, "我先说明背景。")
    await user.click(screen.getByRole("button", { name: i18n.t("practice.guidance.requestHint") }))

    expect(
      await screen.findByRole("button", { name: i18n.t("practice.guidance.requestHint") }),
    ).toBeDisabled()
    const lockedButtonNames = [
      i18n.t("practice.guidance.requestFramework"),
      i18n.t("practice.questionActions.save"),
      i18n.t("practice.questionActions.markWeak"),
      i18n.t("practice.questionActions.skip"),
      i18n.t("practice.questionActions.end"),
      i18n.t("practice.answer.submit"),
    ]
    for (const name of lockedButtonNames) {
      expect(screen.getByRole("button", { name })).toBeDisabled()
    }
    expect(textarea).toBeEnabled()
    await user.type(textarea, "我仍可继续编辑。")
    expect(textarea).toHaveValue("我先说明背景。我仍可继续编辑。")

    await act(async () => {
      request.resolve(hinted)
      await request.promise
    })

    expect(
      await screen.findByText(hinted.session.question.answerHints.content?.[0] ?? ""),
    ).toBeVisible()
    for (const name of lockedButtonNames.slice(0, -1)) {
      expect(screen.getByRole("button", { name })).toBeEnabled()
    }
    expect(screen.getByRole("button", { name: i18n.t("practice.answer.submit") })).toBeEnabled()
  })

  it("does not start a weak mutation while saving is pending", async () => {
    const user = userEvent.setup()
    const answering = createPracticeMockResponse("answeringQuestion")
    const saved = createPracticeMockResponse("answeringSavedQuestion")
    if (answering.session.status !== "answering" || saved.session.status !== "answering") {
      throw new Error("Answering fixtures are required.")
    }
    saved.session.version = answering.session.version + 1
    const request = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(answering)
    vi.mocked(setQuestionSaved).mockReturnValue(request.promise)

    renderPracticePage()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.questionActions.save") }),
    )
    const weakButton = screen.getByRole("button", {
      name: i18n.t("practice.questionActions.markWeak"),
    })
    expect(weakButton).toBeDisabled()
    await user.click(weakButton)
    expect(setQuestionWeak).not.toHaveBeenCalled()

    await act(async () => {
      request.resolve(saved)
      await request.promise
    })
    expect(
      await screen.findByRole("button", { name: i18n.t("practice.questionActions.unsave") }),
    ).toBeEnabled()
  })

  it("keeps an unsubmitted draft when a same-frame mutation is ignored", async () => {
    const user = userEvent.setup()
    const answering = createPracticeMockResponse("answeringQuestion")
    const saved = createPracticeMockResponse("answeringSavedQuestion")
    if (answering.session.status !== "answering" || saved.session.status !== "answering") {
      throw new Error("Answering fixtures are required.")
    }
    saved.session.version = answering.session.version + 1
    const saving = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(answering)
    vi.mocked(setQuestionSaved).mockReturnValue(saving.promise)
    const { router } = renderPracticePage()
    const answer = "这段回答不能因为同步锁忽略提交而被清空。"
    const textarea = await screen.findByLabelText(i18n.t("practice.answer.label"))
    await user.type(textarea, answer)

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: i18n.t("practice.questionActions.save") }))
      fireEvent.click(screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))
    })

    await waitFor(() => expect(setQuestionSaved).toHaveBeenCalledTimes(1))
    expect(submitPrimaryAnswer).not.toHaveBeenCalled()
    expect(textarea).toHaveValue(answer)
    act(() => {
      void router?.navigate({ to: "/profile" })
    })
    expect(await screen.findByText(i18n.t("practice.dialog.leaveTitle"))).toBeInTheDocument()
    expect(router?.state.location.pathname).toBe("/practice")

    await act(async () => {
      saving.resolve(saved)
      await saving.promise
    })
  })

  it("keeps the draft and route blocker after same-frame duplicate submission fails", async () => {
    const user = userEvent.setup()
    const answering = createPracticeMockResponse("answeringQuestion")
    if (answering.session.status !== "answering")
      throw new Error("An answering fixture is required.")
    const submission = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(answering)
    vi.mocked(submitPrimaryAnswer).mockReturnValue(submission.promise)
    const { router } = renderPracticePage()
    const answer = "第一次提交失败后必须保留的完整回答。"
    const textarea = await screen.findByLabelText(i18n.t("practice.answer.label"))
    await user.type(textarea, answer)
    const submitButton = screen.getByRole("button", { name: i18n.t("practice.answer.submit") })

    act(() => {
      fireEvent.click(submitButton)
      fireEvent.click(submitButton)
    })

    await waitFor(() => expect(submitPrimaryAnswer).toHaveBeenCalledTimes(1))
    await act(async () => {
      submission.reject(new Error("unsafe submission details"))
      await submission.promise.catch(() => undefined)
    })

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.submitDescription"),
    )
    expect(textarea).toHaveValue(answer)
    act(() => {
      void router?.navigate({ to: "/profile" })
    })
    expect(await screen.findByText(i18n.t("practice.dialog.leaveTitle"))).toBeInTheDocument()
    expect(router?.state.location.pathname).toBe("/practice")
  })

  it("updates saved and weak question state from mutation snapshots", async () => {
    const user = userEvent.setup()
    const answering = createPracticeMockResponse("answeringQuestion")
    const saved = createPracticeMockResponse("answeringSavedQuestion")
    const weak = createPracticeMockResponse("answeringWeakQuestion")
    if (
      answering.session.status !== "answering" ||
      saved.session.status !== "answering" ||
      weak.session.status !== "answering"
    ) {
      throw new Error("Answering fixtures are required.")
    }
    saved.session.version = answering.session.version + 1
    weak.session.version = saved.session.version + 1
    weak.session.question.isSaved = true
    vi.mocked(getPracticePage).mockResolvedValue(answering)
    vi.mocked(setQuestionSaved).mockResolvedValue(saved)
    vi.mocked(setQuestionWeak).mockResolvedValue(weak)

    renderPracticePage()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.questionActions.save") }),
    )
    expect(
      await screen.findByRole("button", { name: i18n.t("practice.questionActions.unsave") }),
    ).toHaveAttribute("aria-pressed", "true")

    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.questionActions.markWeak") }),
    )
    expect(
      await screen.findByRole("button", { name: i18n.t("practice.questionActions.unmarkWeak") }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("submits a follow-up once, keeps the failed draft, and keeps route blocking active", async () => {
    const user = userEvent.setup()
    const following = createPracticeMockResponse("answeringSingleFollowUp")
    if (following.session.status !== "answeringFollowUp") {
      throw new Error("A follow-up fixture is required.")
    }
    const submission = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(following)
    vi.mocked(submitFollowUpAnswer).mockReturnValue(submission.promise)
    const { router } = renderPracticePage()
    const content = "我会更早确认协作方约束，并约定可验证的共识标准。"
    const textbox = await screen.findByLabelText(i18n.t("practice.followUp.answerLabel"))
    await user.type(textbox, content)
    const submitButton = screen.getByRole("button", { name: i18n.t("practice.followUp.submit") })

    act(() => {
      fireEvent.click(submitButton)
      fireEvent.click(submitButton)
    })

    await waitFor(() => expect(submitFollowUpAnswer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(submitFollowUpAnswer).mock.calls[0]?.[0]).toEqual({
      sessionId: following.session.sessionId,
      version: following.session.version,
      questionId: following.session.question.id,
      followUpQuestionId: following.session.currentFollowUp.question.id,
      content,
    })
    expect(
      await screen.findByRole("button", { name: i18n.t("practice.followUp.submitting") }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.followUp.endAnswering") }),
    ).toBeDisabled()

    await act(async () => {
      submission.reject(new Error("unsafe follow-up failure"))
      await submission.promise.catch(() => undefined)
    })

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.followUpSubmitDescription"),
    )
    expect(textbox).toHaveValue(content)
    act(() => {
      void router?.navigate({ to: "/profile" })
    })
    expect(
      await screen.findByText(i18n.t("practice.dialog.leaveFollowUpTitle")),
    ).toBeInTheDocument()
    expect(router?.state.location.pathname).toBe("/practice")
  })

  it("does not let an old follow-up response overwrite a newer session state", async () => {
    const user = userEvent.setup()
    const following = createPracticeMockResponse("answeringSingleFollowUp")
    const staleNext = createPracticeMockResponse("answeringFollowUp")
    const newer = createPracticeMockResponse("evaluatingAnswer")
    if (
      following.session.status !== "answeringFollowUp" ||
      staleNext.session.status !== "answeringFollowUp" ||
      newer.session.status !== "evaluating"
    ) {
      throw new Error("Follow-up and evaluating fixtures are required.")
    }
    staleNext.session.version = following.session.version + 1
    newer.session.version = following.session.version + 2
    const submission = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(following)
    vi.mocked(getPracticeEvaluationStatus).mockResolvedValue(newer)
    vi.mocked(submitFollowUpAnswer).mockReturnValue(submission.promise)
    const renderResult = renderPracticePage()

    await user.type(
      await screen.findByLabelText(i18n.t("practice.followUp.answerLabel")),
      "这是当前追问的回答。",
    )
    await user.click(screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }))
    await waitFor(() => expect(submitFollowUpAnswer).toHaveBeenCalledTimes(1))
    act(() => {
      renderResult.queryClient.setQueryData(["practice"], newer)
    })
    await act(async () => {
      submission.resolve(staleNext)
      await submission.promise
    })

    expect(renderResult.queryClient.getQueryData(["practice"])).toEqual(newer)
    expect(await screen.findByTestId("practice-evaluating-state")).toBeInTheDocument()
    expect(screen.queryByTestId("practice-answering-follow-up-state")).not.toBeInTheDocument()
    expect(screen.queryByLabelText(i18n.t("practice.followUp.answerLabel"))).not.toBeInTheDocument()
  })
})
