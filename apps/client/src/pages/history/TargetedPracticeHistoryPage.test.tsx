import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { TrainingRecordNotFoundError } from "@/models/training-records"
import { TargetedPracticeHistoryPage } from "@/pages/history"
import { completedTargetedPracticeHistoryStoryFixture } from "@/pages/history/stories/targeted-practice-history-story-fixtures"
import {
  getTargetedPracticeRecord,
  getTrainingRecordReferenceAnswerGenerationStatus,
  requestTrainingRecordReferenceAnswer,
} from "@/services/training-records"
import { renderWithProviders } from "@/test/render"

const recordId = "targeted-practice-record-001"

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ recordId }),
}))

vi.mock("@/services/training-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/training-records")>()),
  getTargetedPracticeRecord: vi.fn(),
  getTrainingRecordReferenceAnswerGenerationStatus: vi.fn(),
  requestTrainingRecordReferenceAnswer: vi.fn(),
}))

describe("TargetedPracticeHistoryPage", () => {
  beforeEach(() => {
    vi.mocked(getTargetedPracticeRecord).mockReset()
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockReset()
    vi.mocked(requestTrainingRecordReferenceAnswer).mockReset()
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockImplementation(
      () => new Promise(() => {}),
    )
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

  it("generates a historical main-question reference in place and updates the detail cache", async () => {
    const user = userEvent.setup()
    const record = structuredClone(completedTargetedPracticeHistoryStoryFixture)
    const question = record.questions[0]
    question.referenceAnswer = { status: "notRequested", content: null }
    const target = {
      kind: "targetedPractice",
      subject: "mainQuestion",
      recordId,
      questionId: question.id,
    } as const
    vi.mocked(getTargetedPracticeRecord).mockResolvedValue(record)
    vi.mocked(requestTrainingRecordReferenceAnswer).mockResolvedValue({
      target,
      referenceAnswer: { status: "generating", content: null },
    })
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockResolvedValue({
      target,
      referenceAnswer: {
        status: "ready",
        content: {
          recommendedStructure: ["结论", "行动", "结果"],
          keyPoints: ["岗位关联"],
          exampleAnswer: "Generated history answer",
          usageGuidance: "Use your own experience.",
          generatedAt: "2026-07-25T08:00:00.000Z",
        },
      },
    })

    renderWithProviders(<TargetedPracticeHistoryPage />)

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: i18n.t("history.detail.reference.title"),
        })
      )[0]!,
    )
    await user.click(
      screen.getByRole("button", { name: i18n.t("history.detail.reference.generate") }),
    )

    expect(await screen.findByText("Generated history answer")).toBeInTheDocument()
    expect(vi.mocked(requestTrainingRecordReferenceAnswer).mock.calls[0]?.[0]).toEqual(target)
    expect(getTrainingRecordReferenceAnswerGenerationStatus).toHaveBeenCalledWith(target)
    expect(getTargetedPracticeRecord).toHaveBeenCalledTimes(1)
  })
})
