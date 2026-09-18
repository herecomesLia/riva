import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"
import { practiceTaskFailureFixture } from "@/mocks/fixtures/practice"
import * as api from "./practice-page-test-api"
import {
  createDeferred,
  mockPractice,
  practiceAt,
  renderPracticePage,
} from "./practice-page-test-utils"

describe("PracticePage: round task", () => {
  it.each([0, 1, 2])(
    "loads the committed review after %s follow-ups without predicting the next step",
    async (count) => {
      const processing = practiceAt("processing")
      const review = practiceAt("review")
      for (let n = 0; n < count; n++)
        processing.rounds[0].turns.push(...structuredClone(review.rounds[0].turns.slice(2)))
      mockPractice(processing, { status: "running", error: null })
      vi.mocked(api.getPracticeTaskState)
        .mockResolvedValueOnce({ status: "running", error: null })
        .mockImplementation(async () => {
          vi.mocked(api.getPracticeRound).mockResolvedValue(review.rounds[0])
          return { status: "idle", error: null }
        })
      renderPracticePage()
      expect(await screen.findByTestId("practice-processing-status")).toBeInTheDocument()
      expect(
        await screen.findByTestId("practice-review-state", {}, { timeout: 3000 }),
      ).toHaveTextContent("78")
    },
  )
  it("retries a failed backend task once while preserving the committed conversation", async () => {
    const processing = practiceAt("processing")
    mockPractice(processing, practiceTaskFailureFixture)
    const retry = createDeferred<void>()
    vi.mocked(api.retryPracticeTask).mockImplementation(async () => {
      await retry.promise
      mockPractice(practiceAt("review"))
    })
    renderPracticePage()
    expect(await screen.findByTestId("practice-task-failure")).toBeInTheDocument()
    expect(screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(
      processing.rounds[0].turns[1].content,
    )
    const button = screen.getByRole("button", { name: i18n.t("practice.taskFailure.retry") })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await waitFor(() => expect(api.retryPracticeTask).toHaveBeenCalledTimes(1))
    expect(api.retryPracticeTask).toHaveBeenCalledWith(processing.id, processing.rounds[0].id)
    await act(async () => {
      retry.resolve()
      await retry.promise
    })
    expect(await screen.findByTestId("practice-review-state")).toBeInTheDocument()
  })
})
