import * as testing from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"

import { PRACTICE_QUERY_KEY } from "../hooks/usePracticeSession"
import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: evaluation", () => {
  it("polls an evaluating snapshot into a review without calculating scores locally", async () => {
    const evaluating = api.createPracticeMockResponse("evaluatingAnswer")
    const review = api.createPracticeMockResponse("reviewBalanced")
    if (evaluating.session.status !== "evaluating" || review.session.status !== "review") {
      throw new Error("Evaluating and review fixtures are required.")
    }
    review.session.version = evaluating.session.version + 1
    vi.mocked(api.getPracticePage).mockResolvedValue(evaluating)
    vi.mocked(api.getPracticeEvaluationStatus).mockResolvedValue(review)

    context.renderPracticePage()

    expect(await testing.screen.findByTestId("practice-review-state")).toHaveTextContent(
      String(review.session.evaluation.overallScore),
    )
    expect(api.getPracticeEvaluationStatus).toHaveBeenCalledWith({
      sessionId: evaluating.session.sessionId,
      version: evaluating.session.version,
      questionId: evaluating.session.question.id,
    })
  })

  it("retries failed evaluation with a new version while preserving the conversation", async () => {
    const evaluating = api.createPracticeMockResponse("evaluatingAnswer")
    if (evaluating.session.status !== "evaluating") {
      throw new Error("An evaluating fixture is required.")
    }
    const retried = structuredClone(evaluating)
    if (retried.session.status !== "evaluating") return
    const nextPoll = context.createDeferred<import("@/models/practice").PracticePageResponse>()
    vi.mocked(api.getPracticePage).mockResolvedValue(evaluating)
    vi.mocked(api.getPracticeEvaluationStatus)
      .mockRejectedValueOnce(new Error("unsafe evaluation prompt and stack"))
      .mockReturnValueOnce(nextPoll.promise)

    context.renderPracticePage()

    const error = await testing.screen.findByTestId("practice-evaluation-error")
    expect(error).toHaveTextContent(i18n.t("practice.errors.evaluationDescription"))
    expect(error).not.toHaveTextContent("unsafe evaluation prompt and stack")
    expect(testing.screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(
      evaluating.session.mainAnswer.content,
    )
    const retryButton = testing.screen.getByRole("button", {
      name: i18n.t("practice.evaluating.retry"),
    })
    testing.act(() => {
      testing.fireEvent.click(retryButton)
      testing.fireEvent.click(retryButton)
    })

    const retryingButton = await testing.screen.findByRole("button", {
      name: i18n.t("practice.evaluating.retrying"),
    })
    expect(retryingButton).toBeDisabled()
    expect(api.retryPracticeEvaluation).not.toHaveBeenCalled()
    expect(vi.mocked(api.getPracticeEvaluationStatus).mock.calls[1]?.[0]).toEqual({
      sessionId: evaluating.session.sessionId,
      version: evaluating.session.version,
      questionId: evaluating.session.question.id,
    })
    await testing.act(async () => {
      nextPoll.resolve(retried)
      await nextPoll.promise
    })
    await testing.waitFor(() => expect(api.getPracticeEvaluationStatus).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.getPracticeEvaluationStatus).mock.calls[1]?.[0]).toEqual({
      sessionId: retried.session.sessionId,
      version: retried.session.version,
      questionId: retried.session.question.id,
    })
    expect(testing.screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(
      evaluating.session.mainAnswer.content,
    )
  })

  it("does not let a stale evaluation response overwrite a newer answer attempt", async () => {
    const evaluating = api.createPracticeMockResponse("evaluatingAnswer")
    const staleReview = api.createPracticeMockResponse("reviewBalanced")
    const newer = api.createPracticeMockResponse("evaluatingNoFollowUp")
    if (
      evaluating.session.status !== "evaluating" ||
      staleReview.session.status !== "review" ||
      newer.session.status !== "evaluating"
    ) {
      throw new Error("Evaluation fixtures are required.")
    }
    staleReview.session.sessionId = evaluating.session.sessionId
    staleReview.session.version = evaluating.session.version + 1
    newer.session.sessionId = "practice_session_new_answer_attempt"
    newer.session.version = evaluating.session.version + 2
    const poll = context.createDeferred<import("@/models/practice").PracticePageResponse>()
    vi.mocked(api.getPracticePage).mockResolvedValue(evaluating)
    vi.mocked(api.getPracticeEvaluationStatus)
      .mockReturnValueOnce(poll.promise)
      .mockReturnValue(new Promise(() => undefined))
    const renderResult = context.renderPracticePage()

    expect(await testing.screen.findByTestId("practice-evaluating-state")).toBeInTheDocument()
    await testing.waitFor(() => expect(api.getPracticeEvaluationStatus).toHaveBeenCalledTimes(1))
    testing.act(() => {
      renderResult.queryClient.setQueryData(PRACTICE_QUERY_KEY, newer)
    })
    await testing.act(async () => {
      poll.resolve(staleReview)
      await poll.promise
    })

    expect(renderResult.queryClient.getQueryData(PRACTICE_QUERY_KEY)).toEqual(newer)
    expect(testing.screen.queryByTestId("practice-review-state")).not.toBeInTheDocument()
  })
})
