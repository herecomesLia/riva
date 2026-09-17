import * as testing from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"

import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: round task", () => {
  it.each(["processingNoFollowUp", "processingAnswer", "processingFollowUpEndedEarly"] as const)(
    "resolves %s directly into review without predicting the next step",
    async (scenario) => {
      const processing = api.createPracticeScenario(scenario)
      const review = api.createPracticeScenario("reviewBalanced")
      if (processing.session.status !== "processing" || review.session.status !== "review") {
        throw new Error("Processing and review fixtures are required.")
      }

      vi.mocked(api.getPracticePage).mockResolvedValue(processing)
      vi.mocked(api.getPracticeTaskStatus).mockResolvedValue(review.session)

      context.renderPracticePage()

      expect(await testing.screen.findByTestId("practice-review-state")).toHaveTextContent(
        String(review.session.evaluation.overallScore),
      )
    },
  )

  it("retries the round task while preserving the conversation", async () => {
    const processing = api.createPracticeScenario("processingAnswer")
    const review = api.createPracticeScenario("reviewBalanced")
    const retry = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(processing)
    vi.mocked(api.getPracticeTaskStatus).mockRejectedValueOnce(new Error("unsafe task details"))
    vi.mocked(api.retryPracticeTask).mockReturnValueOnce(retry.promise)
    context.renderPracticePage()
    expect(await testing.screen.findByTestId("practice-task-failure")).not.toHaveTextContent(
      "unsafe task details",
    )
    if (processing.session.status !== "processing") throw new Error("Processing fixture required.")
    const timeline = testing.screen.getByTestId("practice-conversation-timeline")
    expect(timeline).toHaveTextContent(processing.session.mainAnswer.content)
    for (const exchange of processing.session.followUps) {
      expect(timeline).toHaveTextContent(exchange.question.prompt)
      expect(timeline).toHaveTextContent(exchange.answer.content)
    }
    const retryButton = testing.screen.getByRole("button", {
      name: i18n.t("practice.taskFailure.retry"),
    })
    testing.act(() => {
      testing.fireEvent.click(retryButton)
      testing.fireEvent.click(retryButton)
    })
    expect(
      await testing.screen.findByRole("button", { name: i18n.t("practice.taskFailure.retrying") }),
    ).toBeDisabled()
    expect(api.retryPracticeTask).toHaveBeenCalledTimes(1)
    await testing.act(async () => {
      retry.resolve(review.session)
      await retry.promise
    })
    expect(await testing.screen.findByTestId("practice-review-state")).toBeInTheDocument()
  })
})
