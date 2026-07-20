import { act, screen, waitFor } from "@testing-library/react"
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
  startPracticeSession,
} from "@/services/practice"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/practice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/practice")>()),
  getPracticePage: vi.fn(),
  getQuestionGenerationStatus: vi.fn(),
  startPracticeSession: vi.fn(),
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
    vi.mocked(startPracticeSession).mockReset()
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

    expect(await screen.findByTestId("practice-question-ready-state")).toHaveTextContent(
      answering.session.status === "answering" ? answering.session.question.prompt : "",
    )
    expect(getQuestionGenerationStatus).toHaveBeenCalledWith({
      sessionId:
        generating.session.status === "generatingQuestion" ? generating.session.sessionId : "",
      version: generating.session.status === "generatingQuestion" ? generating.session.version : 0,
    })
  })

  it("shows generation failure with preserved settings and retries with them", async () => {
    const user = userEvent.setup()
    const generating = createPracticeMockResponse("generatingQuestion")
    const retrying = createPracticeMockResponse("generatingQuestion")
    if (
      generating.session.status !== "generatingQuestion" ||
      retrying.session.status !== "generatingQuestion"
    ) {
      throw new Error("Generation fixtures must use the generating state.")
    }
    generating.session.selection.difficulty = "pressure"
    retrying.session.sessionId = "practice_session_retry"
    retrying.session.selection = structuredClone(generating.session.selection)
    vi.mocked(getPracticePage).mockResolvedValue(generating)
    vi.mocked(getQuestionGenerationStatus)
      .mockRejectedValueOnce(new Error("unsafe generation details"))
      .mockReturnValue(new Promise(() => undefined))
    vi.mocked(startPracticeSession).mockResolvedValue(retrying)

    renderPracticePage()

    const errorState = await screen.findByTestId("practice-generation-error-state")
    expect(errorState).toHaveTextContent(i18n.t("practice.difficulty.pressure"))
    expect(errorState).not.toHaveTextContent("unsafe generation details")
    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.actions.retryGeneration") }),
    )

    expect(vi.mocked(startPracticeSession).mock.calls[0]?.[0]).toEqual(generating.session.selection)
    expect(await screen.findByTestId("practice-generating-state")).toBeInTheDocument()
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
})
