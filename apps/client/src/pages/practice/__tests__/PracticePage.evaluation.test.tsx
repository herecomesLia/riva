import * as testing from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"

import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: evaluation", () => {
  it("polls an evaluating snapshot into a review without calculating scores locally", async () => {
    const evaluating = api.createPracticeScenario("evaluatingAnswer")
    const review = api.createPracticeScenario("reviewBalanced")
    if (evaluating.session.status !== "evaluating" || review.session.status !== "review") {
      throw new Error("Evaluating and review fixtures are required.")
    }

    vi.mocked(api.getPracticePage).mockResolvedValue(evaluating)
    vi.mocked(api.getPracticeEvaluationStatus).mockResolvedValue(review.session)

    context.renderPracticePage()

    expect(await testing.screen.findByTestId("practice-review-state")).toHaveTextContent(
      String(review.session.evaluation.overallScore),
    )
  })

  it("retries failed evaluation while preserving the conversation", async () => {
    const evaluating = api.createPracticeScenario("evaluatingAnswer")
    const review = api.createPracticeScenario("reviewBalanced")
    const retry = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(evaluating)
    vi.mocked(api.getPracticeEvaluationStatus)
      .mockRejectedValueOnce(new Error("unsafe evaluation details"))
      .mockReturnValueOnce(retry.promise)
    context.renderPracticePage()
    expect(await testing.screen.findByTestId("practice-evaluation-error")).not.toHaveTextContent(
      "unsafe evaluation details",
    )
    const retryButton = testing.screen.getByRole("button", {
      name: i18n.t("practice.evaluating.retry"),
    })
    testing.act(() => {
      testing.fireEvent.click(retryButton)
      testing.fireEvent.click(retryButton)
    })
    expect(
      await testing.screen.findByRole("button", { name: i18n.t("practice.evaluating.retrying") }),
    ).toBeDisabled()
    expect(api.getPracticeEvaluationStatus).toHaveBeenCalledTimes(2)
    await testing.act(async () => {
      retry.resolve(review.session)
      await retry.promise
    })
    expect(await testing.screen.findByTestId("practice-review-state")).toBeInTheDocument()
  })
})
