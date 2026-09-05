import * as testing from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"

import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: generation", () => {
  it("polls question generation into an answering snapshot", async () => {
    const generating = api.createPracticeScenario("generatingQuestion")
    const answering = api.createPracticeScenario("answeringQuestion")
    if (
      generating.session.status !== "generatingQuestion" ||
      answering.session.status !== "answering"
    ) {
      throw new Error("Generating and answering fixtures are required.")
    }

    answering.session.selection = structuredClone(generating.session.selection)

    vi.mocked(api.getPracticePage).mockResolvedValue(generating)
    vi.mocked(api.getQuestionGenerationStatus).mockResolvedValue(answering.session)

    context.renderPracticePage()

    expect(await testing.screen.findByTestId("practice-answering-state")).toHaveTextContent(
      answering.session.status === "answering" ? answering.session.question.prompt : "",
    )
  })

  it("retries a failed generation query without creating a new session", async () => {
    const user = userEvent.setup()
    const generating = api.createPracticeScenario("generatingQuestion")
    const answering = api.createPracticeScenario("answeringQuestion")
    if (
      generating.session.status !== "generatingQuestion" ||
      answering.session.status !== "answering"
    ) {
      throw new Error("Generating and answering fixtures are required.")
    }
    generating.session.selection.difficulty = "pressure"

    answering.session.selection = structuredClone(generating.session.selection)

    const retryQuery =
      context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
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

    await testing.waitFor(() => expect(api.getQuestionGenerationStatus).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.getQuestionGenerationStatus).mock.calls).toEqual([
      [undefined],
      [undefined],
    ])
    expect(api.startPracticeSession).not.toHaveBeenCalled()
    await testing.act(async () => {
      retryQuery.resolve(answering.session)
      await retryQuery.promise
    })
    expect(await testing.screen.findByTestId("practice-answering-state")).toBeInTheDocument()

    expect(answering.session.selection).toEqual(generating.session.selection)
  })
})
