import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { TrainingRecordNotFoundError } from "@/models/training-records"
import { MockInterviewHistoryPage } from "@/pages/history"
import { completeMockInterviewHistoryStoryFixture } from "@/pages/history/stories/mock-interview-history-story-fixtures"
import {
  getMockInterviewRecord,
  getTrainingRecordReferenceAnswerGenerationStatus,
  requestTrainingRecordReferenceAnswer,
} from "@/services/training-records"
import { renderWithProviders } from "@/test/render"

const recordId = "mock-interview-record-001"

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ recordId }),
}))

vi.mock("@/services/training-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/training-records")>()),
  getMockInterviewRecord: vi.fn(),
  getTrainingRecordReferenceAnswerGenerationStatus: vi.fn(),
  requestTrainingRecordReferenceAnswer: vi.fn(),
}))

describe("MockInterviewHistoryPage", () => {
  beforeEach(() => {
    vi.mocked(getMockInterviewRecord).mockReset()
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockReset()
    vi.mocked(requestTrainingRecordReferenceAnswer).mockReset()
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockImplementation(
      () => new Promise(() => {}),
    )
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

  it("generates a historical follow-up reference in place with stable target identity", async () => {
    const user = userEvent.setup()
    const record = structuredClone(completeMockInterviewHistoryStoryFixture)
    const question = record.questions[1]
    const followUp = question.followUps[0]
    followUp.referenceAnswer = { status: "notRequested", content: null }
    const target = {
      kind: "mockInterview",
      subject: "followUp",
      recordId,
      questionId: question.id,
      followUpId: followUp.id,
    } as const
    vi.mocked(getMockInterviewRecord).mockResolvedValue(record)
    vi.mocked(requestTrainingRecordReferenceAnswer).mockResolvedValue({
      target,
      referenceAnswer: { status: "generating", content: null },
    })
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockImplementation(
      async (candidate) =>
        candidate.subject === "followUp" && candidate.followUpId === followUp.id
          ? {
              target,
              referenceAnswer: {
                status: "ready",
                content: {
                  recommendedStructure: ["结论", "证据"],
                  keyPoints: ["回应追问"],
                  exampleAnswer: "Generated follow-up history answer",
                  usageGuidance: "Adapt this answer.",
                  generatedAt: "2026-07-25T08:01:00.000Z",
                },
              },
            }
          : new Promise(() => {}),
    )

    renderWithProviders(<MockInterviewHistoryPage />)

    const generateButtons = await screen.findAllByRole("button", {
      name: i18n.t("history.detail.reference.generate"),
    })
    await user.click(generateButtons.at(-1)!)

    expect(await screen.findByText("Generated follow-up history answer")).toBeInTheDocument()
    expect(vi.mocked(requestTrainingRecordReferenceAnswer).mock.calls[0]?.[0]).toEqual(target)
    expect(getMockInterviewRecord).toHaveBeenCalledTimes(1)
  })
})
