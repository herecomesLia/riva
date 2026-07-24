import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { TrainingRecordNotFoundError } from "@/models/training-records"
import { MockInterviewHistoryPage } from "@/pages/history"
import { completeMockInterviewHistoryStoryFixture } from "@/pages/history/stories/mock-interview-history-story-fixtures"
import { getMockInterviewRecord } from "@/services/training-records"
import { renderWithProviders } from "@/test/render"

const recordId = "mock-interview-record-001"

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ recordId }),
}))

vi.mock("@/services/training-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/training-records")>()),
  getMockInterviewRecord: vi.fn(),
}))

describe("MockInterviewHistoryPage", () => {
  beforeEach(() => {
    vi.mocked(getMockInterviewRecord).mockReset()
  })

  it("queries independently by the route record ID and maps ready data", async () => {
    vi.mocked(getMockInterviewRecord).mockResolvedValue(
      structuredClone(completeMockInterviewHistoryStoryFixture),
    )
    renderWithProviders(<MockInterviewHistoryPage />)

    expect(
      await screen.findByText(completeMockInterviewHistoryStoryFixture.questions[0].prompt),
    ).toBeInTheDocument()
    expect(getMockInterviewRecord).toHaveBeenCalledWith(recordId)
  })

  it("maps structured missing-record errors to not found", async () => {
    vi.mocked(getMockInterviewRecord).mockRejectedValue(
      new TrainingRecordNotFoundError("mockInterview", recordId),
    )
    renderWithProviders(<MockInterviewHistoryPage />)

    expect(await screen.findByText(i18n.t("history.mockDetail.notFound.title"))).toBeInTheDocument()
  })

  it("retries query failures without reading current interview cache", async () => {
    const user = userEvent.setup()
    vi.mocked(getMockInterviewRecord)
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce(structuredClone(completeMockInterviewHistoryStoryFixture))
    renderWithProviders(<MockInterviewHistoryPage />)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(
      await screen.findByText(completeMockInterviewHistoryStoryFixture.questions[0].prompt),
    ).toBeInTheDocument()
    expect(getMockInterviewRecord).toHaveBeenCalledTimes(2)
  })
})
