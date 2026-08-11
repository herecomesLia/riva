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
})
