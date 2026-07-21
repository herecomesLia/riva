import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createPracticeMockResponse } from "@/mocks/data/practice"
import type { PracticePageResponse } from "@/models/practice"
import { PracticePage } from "@/pages/practice"
import {
  getPracticePage,
  getQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitPracticeAnswer,
} from "@/services/practice"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/practice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/practice")>()),
  getPracticePage: vi.fn(),
  getQuestionGenerationStatus: vi.fn(),
  requestAnswerFramework: vi.fn(),
  requestEndPracticeSession: vi.fn(),
  requestPracticeHint: vi.fn(),
  setQuestionSaved: vi.fn(),
  setQuestionWeak: vi.fn(),
  skipPracticeQuestion: vi.fn(),
  startPracticeSession: vi.fn(),
  submitPracticeAnswer: vi.fn(),
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
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getPracticePage).mockReset()
    vi.mocked(getQuestionGenerationStatus).mockReset()
    vi.mocked(requestAnswerFramework).mockReset()
    vi.mocked(requestEndPracticeSession).mockReset()
    vi.mocked(requestPracticeHint).mockReset()
    vi.mocked(setQuestionSaved).mockReset()
    vi.mocked(setQuestionWeak).mockReset()
    vi.mocked(skipPracticeQuestion).mockReset()
    vi.mocked(startPracticeSession).mockReset()
    vi.mocked(submitPracticeAnswer).mockReset()
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

  it("prevents duplicate main-answer submission and enters evaluating", async () => {
    const user = userEvent.setup()
    const answering = createPracticeMockResponse("answeringQuestion")
    const evaluating = createPracticeMockResponse("evaluatingAnswer")
    if (answering.session.status !== "answering" || evaluating.session.status !== "evaluating") {
      throw new Error("Answering and evaluating fixtures are required.")
    }
    evaluating.session.version = answering.session.version + 1
    const submission = createDeferred<PracticePageResponse>()
    vi.mocked(getPracticePage).mockResolvedValue(answering)
    vi.mocked(submitPracticeAnswer).mockReturnValue(submission.promise)

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
    expect(submitPracticeAnswer).toHaveBeenCalledTimes(1)
    expect(requestPracticeHint).not.toHaveBeenCalled()
    expect(requestAnswerFramework).not.toHaveBeenCalled()
    expect(setQuestionSaved).not.toHaveBeenCalled()
    expect(setQuestionWeak).not.toHaveBeenCalled()
    expect(skipPracticeQuestion).not.toHaveBeenCalled()
    expect(requestEndPracticeSession).not.toHaveBeenCalled()

    await act(async () => {
      submission.resolve(evaluating)
      await submission.promise
    })
    expect(await screen.findByTestId("practice-evaluating-state")).toBeInTheDocument()
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
    expect(submitPracticeAnswer).not.toHaveBeenCalled()
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
    vi.mocked(submitPracticeAnswer).mockReturnValue(submission.promise)
    const { router } = renderPracticePage()
    const answer = "第一次提交失败后必须保留的完整回答。"
    const textarea = await screen.findByLabelText(i18n.t("practice.answer.label"))
    await user.type(textarea, answer)
    const submitButton = screen.getByRole("button", { name: i18n.t("practice.answer.submit") })

    act(() => {
      fireEvent.click(submitButton)
      fireEvent.click(submitButton)
    })

    await waitFor(() => expect(submitPracticeAnswer).toHaveBeenCalledTimes(1))
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
})
