import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"
import * as api from "./practice-page-test-api"
import { mockPractice, practiceAt, renderPracticePage } from "./practice-page-test-utils"

describe("PracticePage: generation", () => {
  it("keeps polling queued and running tasks until the question is committed", async () => {
    const generating = practiceAt("generating")
    const answering = practiceAt("answering")
    mockPractice(generating)
    vi.mocked(api.getPracticeTaskState)
      .mockResolvedValueOnce({ status: "queued", error: null })
      .mockResolvedValueOnce({ status: "running", error: null })
      .mockImplementation(async () => {
        vi.mocked(api.getPracticeRound).mockResolvedValue(answering.rounds[0])
        return { status: "idle", error: null }
      })
    renderPracticePage()
    expect(await screen.findByTestId("practice-generating-state")).toBeInTheDocument()
    expect(
      await screen.findByTestId("practice-answering-state", {}, { timeout: 4000 }),
    ).toHaveTextContent(answering.rounds[0].turns[0].content)
    expect(api.getPracticeTaskState).toHaveBeenCalledWith(
      generating.id,
      generating.rounds[0].id,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
  it("retries a failed task read without posting a task retry or creating a session", async () => {
    mockPractice(practiceAt("answering"))
    vi.mocked(api.getPracticeTaskState).mockRejectedValueOnce(
      new Error("unsafe generation details"),
    )
    renderPracticePage()
    expect(await screen.findByRole("alert")).not.toHaveTextContent("unsafe generation details")
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(await screen.findByTestId("practice-answering-state")).toBeInTheDocument()
    expect(api.retryPracticeTask).not.toHaveBeenCalled()
    expect(api.createPractice).not.toHaveBeenCalled()
  })
})
