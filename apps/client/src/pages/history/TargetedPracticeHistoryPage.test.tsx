import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { TrainingRecordNotFoundError } from "@/models/training-records"
import { TargetedPracticeHistoryPage } from "@/pages/history"
import { completedTargetedPracticeHistoryStoryFixture } from "@/pages/history/stories/targeted-practice-history-story-fixtures"
import { getTargetedPracticeRecord } from "@/services/training-records"
import { renderWithProviders } from "@/test/render"

const recordId = "targeted-practice-record-001"

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ recordId }),
}))

vi.mock("@/services/training-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/training-records")>()),
  getTargetedPracticeRecord: vi.fn(),
}))

describe("TargetedPracticeHistoryPage", () => {
  beforeEach(() => {
    vi.mocked(getTargetedPracticeRecord).mockReset()
  })

  it("queries the record independently by the route ID and maps ready data", async () => {
    vi.mocked(getTargetedPracticeRecord).mockResolvedValue(
      structuredClone(completedTargetedPracticeHistoryStoryFixture),
    )

    renderWithProviders(<TargetedPracticeHistoryPage />)

    expect(
      await screen.findAllByText(completedTargetedPracticeHistoryStoryFixture.questions[0].prompt),
    ).toHaveLength(2)
    expect(getTargetedPracticeRecord).toHaveBeenCalledWith(recordId)
  })

  it("maps structured missing-record errors to not found", async () => {
    vi.mocked(getTargetedPracticeRecord).mockRejectedValue(
      new TrainingRecordNotFoundError("targetedPractice", recordId),
    )

    renderWithProviders(<TargetedPracticeHistoryPage />)

    expect(await screen.findByText(i18n.t("history.detail.notFound.title"))).toBeInTheDocument()
  })

  it("maps other failures to retryable error and refetches", async () => {
    const user = userEvent.setup()
    vi.mocked(getTargetedPracticeRecord)
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce(structuredClone(completedTargetedPracticeHistoryStoryFixture))

    renderWithProviders(<TargetedPracticeHistoryPage />)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(
      await screen.findAllByText(completedTargetedPracticeHistoryStoryFixture.questions[0].prompt),
    ).toHaveLength(2)
    expect(getTargetedPracticeRecord).toHaveBeenCalledTimes(2)
  })
})
