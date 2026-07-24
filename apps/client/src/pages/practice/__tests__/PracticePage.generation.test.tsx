import * as testing from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"

import { PRACTICE_QUERY_KEY } from "../hooks/usePracticeSession"
import "./practice-page-service-mock"
import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: generation", () => {
  it("polls question generation into an answering snapshot", async () => {
    const generating = api.createPracticeMockResponse("generatingQuestion")
    const answering = api.createPracticeMockResponse("answeringQuestion")
    vi.mocked(api.getPracticePage).mockResolvedValue(generating)
    vi.mocked(api.getQuestionGenerationStatus).mockResolvedValue(answering)

    context.renderPracticePage()

    expect(await testing.screen.findByTestId("practice-answering-state")).toHaveTextContent(
      answering.session.status === "answering" ? answering.session.question.prompt : "",
    )
    expect(api.getQuestionGenerationStatus).toHaveBeenCalledWith({
      sessionId:
        generating.session.status === "generatingQuestion" ? generating.session.sessionId : "",
      version: generating.session.status === "generatingQuestion" ? generating.session.version : 0,
    })
  })

  it("retries a failed generation query without creating a new session", async () => {
    const user = userEvent.setup()
    const generating = api.createPracticeMockResponse("generatingQuestion")
    const answering = api.createPracticeMockResponse("answeringQuestion")
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
    const retryQuery = context.createDeferred<import("@/models/practice").PracticePageResponse>()
    vi.mocked(api.getPracticePage).mockResolvedValue(generating)
    vi.mocked(api.getQuestionGenerationStatus)
      .mockRejectedValueOnce(new Error("unsafe generation details"))
      .mockReturnValueOnce(retryQuery.promise)

    context.renderPracticePage()

    const errorState = await testing.screen.findByTestId("practice-generation-error-state")
    expect(errorState).toHaveTextContent(i18n.t("practice.difficulty.pressure"))
    expect(errorState).not.toHaveTextContent("unsafe generation details")
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.actions.retryGeneration") }),
    )
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.actions.retryingGeneration") }),
    ).toBeDisabled()

    const expectedInput = {
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    }
    await testing.waitFor(() => expect(api.getQuestionGenerationStatus).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.getQuestionGenerationStatus).mock.calls).toEqual([
      [expectedInput],
      [expectedInput],
    ])
    expect(api.startPracticeSession).not.toHaveBeenCalled()
    await testing.act(async () => {
      retryQuery.resolve(answering)
      await retryQuery.promise
    })
    expect(await testing.screen.findByTestId("practice-answering-state")).toBeInTheDocument()
    expect(answering.session.sessionId).toBe(generating.session.sessionId)
    expect(answering.session.selection).toEqual(generating.session.selection)
    expect(answering.session.startedAt).toBe(generating.session.startedAt)
  })

  it("does not let a stale poll response overwrite a newer session", async () => {
    const first = api.createPracticeMockResponse("generatingQuestion")
    const second = api.createPracticeMockResponse("generatingQuestion")
    const oldAnswering = api.createPracticeMockResponse("answeringQuestion")
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
    const firstPoll = context.createDeferred<import("@/models/practice").PracticePageResponse>()
    vi.mocked(api.getPracticePage).mockResolvedValue(first)
    vi.mocked(api.getQuestionGenerationStatus)
      .mockReturnValueOnce(firstPoll.promise)
      .mockReturnValue(new Promise(() => undefined))
    const renderResult = context.renderPracticePage()

    expect(await testing.screen.findByTestId("practice-generating-state")).toBeInTheDocument()
    await testing.waitFor(() => expect(api.getQuestionGenerationStatus).toHaveBeenCalledTimes(1))
    testing.act(() => {
      renderResult.queryClient.setQueryData(PRACTICE_QUERY_KEY, second)
    })
    await testing.act(async () => {
      firstPoll.resolve(oldAnswering)
      await firstPoll.promise
    })

    expect(renderResult.queryClient.getQueryData(PRACTICE_QUERY_KEY)).toEqual(second)
    await testing.waitFor(() =>
      expect(testing.screen.getByTestId("practice-generating-state")).toHaveTextContent(
        i18n.t("practice.difficulty.pressure"),
      ),
    )
  })
})
