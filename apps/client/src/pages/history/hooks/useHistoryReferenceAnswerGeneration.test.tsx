import { QueryClientProvider, useQuery, type QueryKey } from "@tanstack/react-query"
import { act, fireEvent, render, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  TargetedPracticeRecordDetailResponse,
  TrainingRecordReferenceAnswer,
  TrainingRecordReferenceAnswerGenerationResponse,
  TrainingRecordReferenceAnswerTarget,
} from "@/models/training-records"
import { completedTargetedPracticeHistoryStoryFixture } from "@/pages/history/stories/targeted-practice-history-story-fixtures"
import { i18n } from "@/i18n/i18n"
import {
  getTrainingRecordReferenceAnswerGenerationStatus,
  requestTrainingRecordReferenceAnswer,
} from "@/services/training-records"
import { createTestQueryClient } from "@/test/query-client"

import { HistoryReferenceAnswer } from "../components/HistoryReferenceAnswer"
import {
  HISTORY_REFERENCE_POLL_RETRY_DELAY_MS,
  HISTORY_REFERENCE_POLL_RETRY_LIMIT,
  HISTORY_REFERENCE_POLL_TIMEOUT_MS,
  useHistoryReferenceAnswerGeneration,
} from "./useHistoryReferenceAnswerGeneration"

vi.mock("@/services/training-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/training-records")>()),
  getTrainingRecordReferenceAnswerGenerationStatus: vi.fn(),
  requestTrainingRecordReferenceAnswer: vi.fn(),
}))

const detailQueryKey = ["training-records", "detail", "polling-test"] as const

function readyResponse(
  target: TrainingRecordReferenceAnswerTarget,
  answer = "Generated reference answer",
): TrainingRecordReferenceAnswerGenerationResponse {
  return {
    target,
    referenceAnswer: {
      status: "ready",
      content: {
        recommendedStructure: ["结论", "行动", "结果"],
        keyPoints: ["岗位关联"],
        exampleAnswer: answer,
        usageGuidance: "Adapt this answer.",
        generatedAt: "2026-07-25T08:00:00.000Z",
      },
    },
  }
}

function createRecord(
  first: TrainingRecordReferenceAnswer,
  second: TrainingRecordReferenceAnswer = { status: "notRequested", content: null },
) {
  const record = structuredClone(completedTargetedPracticeHistoryStoryFixture)
  record.questions[0]!.referenceAnswer = first
  record.questions[1]!.referenceAnswer = second
  return record
}

function mainTarget(
  record: TargetedPracticeRecordDetailResponse,
  questionIndex = 0,
): TrainingRecordReferenceAnswerTarget {
  return {
    kind: "targetedPractice",
    subject: "mainQuestion",
    recordId: record.id,
    questionId: record.questions[questionIndex]!.id,
  }
}

function ReferenceGenerationHarness({ queryKey }: { queryKey: QueryKey }) {
  const query = useQuery<TargetedPracticeRecordDetailResponse>({
    enabled: false,
    queryFn: () => Promise.reject(new Error("Detail query is disabled in this harness.")),
    queryKey,
  })
  const generation = useHistoryReferenceAnswerGeneration({
    detailQueryKey: queryKey,
    kind: "targetedPractice",
    record: query.data,
    recordId: query.data?.id ?? "",
  })
  if (!query.data) return null

  return (
    <>
      {query.data.questions.slice(0, 2).map((question) => {
        const subject = { subject: "mainQuestion" as const, questionId: question.id }
        return (
          <div data-testid={`question-${question.id}`} key={question.id}>
            <HistoryReferenceAnswer
              isRequesting={generation.isRequesting(subject)}
              onGenerate={() => generation.generate(subject)}
              referenceAnswer={question.referenceAnswer}
            />
          </div>
        )
      })}
    </>
  )
}

function renderHarness(record: TargetedPracticeRecordDetailResponse) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(detailQueryKey, record)
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ReferenceGenerationHarness queryKey={detailQueryKey} />
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}

function cachedRecord(queryClient: ReturnType<typeof createTestQueryClient>) {
  const record = queryClient.getQueryData<TargetedPracticeRecordDetailResponse>(detailQueryKey)
  if (!record) throw new Error("Expected a cached training record.")
  return record
}

async function flushTimers(milliseconds = 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

describe("useHistoryReferenceAnswerGeneration", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime("2026-07-25T08:00:00.000Z")
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockReset()
    vi.mocked(requestTrainingRecordReferenceAnswer).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("retries one failed poll with the explicit policy and then succeeds", async () => {
    const record = createRecord({ status: "generating", content: null })
    const target = mainTarget(record)
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus)
      .mockRejectedValueOnce(new Error("temporary polling failure"))
      .mockResolvedValueOnce(readyResponse(target))

    const { queryClient } = renderHarness(record)
    await flushTimers()

    expect(cachedRecord(queryClient).questions[0]!.referenceAnswer.status).toBe("pollingRetrying")
    expect(getTrainingRecordReferenceAnswerGenerationStatus).toHaveBeenCalledTimes(1)

    await flushTimers(HISTORY_REFERENCE_POLL_RETRY_DELAY_MS)
    await flushTimers()

    expect(cachedRecord(queryClient).questions[0]!.referenceAnswer.status).toBe("ready")
    expect(getTrainingRecordReferenceAnswerGenerationStatus).toHaveBeenCalledTimes(2)
  })

  it("stops after the consecutive failure limit and leaves a recoverable cache state", async () => {
    const record = createRecord({ status: "generating", content: null })
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockRejectedValue(
      new Error("polling unavailable"),
    )

    const { queryClient } = renderHarness(record)
    await flushTimers(HISTORY_REFERENCE_POLL_RETRY_DELAY_MS * HISTORY_REFERENCE_POLL_RETRY_LIMIT)
    await flushTimers()

    expect(getTrainingRecordReferenceAnswerGenerationStatus).toHaveBeenCalledTimes(
      HISTORY_REFERENCE_POLL_RETRY_LIMIT + 1,
    )
    expect(cachedRecord(queryClient).questions[0]!.referenceAnswer).toEqual({
      status: "pollingFailed",
      content: null,
      reason: "consecutiveFailures",
    })
  })

  it("terminates a pending poll at the timeout without real waiting", async () => {
    const record = createRecord({ status: "generating", content: null })
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockImplementation(
      () => new Promise(() => undefined),
    )

    const { queryClient } = renderHarness(record)
    await flushTimers()
    await flushTimers(HISTORY_REFERENCE_POLL_TIMEOUT_MS)

    expect(cachedRecord(queryClient).questions[0]!.referenceAnswer).toEqual({
      status: "pollingFailed",
      content: null,
      reason: "timeout",
    })
    expect(getTrainingRecordReferenceAnswerGenerationStatus).toHaveBeenCalledTimes(1)
  })

  it("allows a failed progress check to be restarted and complete", async () => {
    const record = createRecord({
      status: "pollingFailed",
      content: null,
      reason: "consecutiveFailures",
    })
    const target = mainTarget(record)
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockResolvedValue(
      readyResponse(target),
    )

    const { getByRole, queryClient } = renderHarness(record)
    fireEvent.click(getByRole("button", { name: i18n.t("history.detail.reference.recheck") }))
    await flushTimers()

    expect(cachedRecord(queryClient).questions[0]!.referenceAnswer.status).toBe("ready")
    expect(getTrainingRecordReferenceAnswerGenerationStatus).toHaveBeenCalledOnce()
    expect(requestTrainingRecordReferenceAnswer).not.toHaveBeenCalled()
  })

  it("allows a business generation failure to be generated again successfully", async () => {
    const record = createRecord({
      status: "unavailable",
      content: null,
      reason: "generationFailed",
    })
    const target = mainTarget(record)
    vi.mocked(requestTrainingRecordReferenceAnswer).mockResolvedValue({
      target,
      referenceAnswer: { status: "generating", content: null },
    })
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockResolvedValue(
      readyResponse(target),
    )

    const { getByTestId, queryClient } = renderHarness(record)
    fireEvent.click(
      within(getByTestId(`question-${record.questions[0]!.id}`)).getByRole("button", {
        name: i18n.t("history.detail.reference.generate"),
      }),
    )
    await flushTimers()

    expect(cachedRecord(queryClient).questions[0]!.referenceAnswer.status).toBe("ready")
    expect(requestTrainingRecordReferenceAnswer).toHaveBeenCalledOnce()
  })

  it("keeps simultaneous question polling independent", async () => {
    const record = createRecord(
      { status: "generating", content: null },
      { status: "generating", content: null },
    )
    const firstTarget = mainTarget(record)
    const secondTarget = mainTarget(record, 1)
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockImplementation(
      async (target) => {
        if (target.questionId === firstTarget.questionId) throw new Error("first failed")
        return readyResponse(secondTarget, "Second question answer")
      },
    )

    const originalSecondQuestion = structuredClone(record.questions[1])
    const { queryClient } = renderHarness(record)
    await flushTimers(HISTORY_REFERENCE_POLL_RETRY_DELAY_MS * HISTORY_REFERENCE_POLL_RETRY_LIMIT)
    await flushTimers()

    const cached = cachedRecord(queryClient)
    expect(cached.questions[0]!.referenceAnswer.status).toBe("pollingFailed")
    expect(cached.questions[1]).toEqual({
      ...originalSecondQuestion,
      referenceAnswer: expect.objectContaining({ status: "ready" }),
    })
    expect(cached.questions[0]!.answer).toEqual(record.questions[0]!.answer)
    expect(cached.questions[0]!.evaluation).toEqual(record.questions[0]!.evaluation)
    expect(cached.questions[0]!.review).toEqual(record.questions[0]!.review)
  })

  it("removes polling work on unmount and starts a fresh check when reopened", async () => {
    const record = createRecord({ status: "generating", content: null })
    const target = mainTarget(record)
    let resolveFirst!: (response: TrainingRecordReferenceAnswerGenerationResponse) => void
    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )

    const first = renderHarness(record)
    await flushTimers()
    expect(getTrainingRecordReferenceAnswerGenerationStatus).toHaveBeenCalledOnce()
    first.unmount()

    resolveFirst(readyResponse(target, "Late answer"))
    await flushTimers()
    expect(cachedRecord(first.queryClient).questions[0]!.referenceAnswer.status).toBe("generating")

    vi.mocked(getTrainingRecordReferenceAnswerGenerationStatus).mockResolvedValue(
      readyResponse(target, "Reopened answer"),
    )
    render(
      <QueryClientProvider client={first.queryClient}>
        <ReferenceGenerationHarness queryKey={detailQueryKey} />
      </QueryClientProvider>,
    )
    await flushTimers()

    expect(cachedRecord(first.queryClient).questions[0]!.referenceAnswer).toMatchObject({
      status: "ready",
      content: { exampleAnswer: "Reopened answer" },
    })
    expect(getTrainingRecordReferenceAnswerGenerationStatus).toHaveBeenCalledTimes(2)
  })
})
