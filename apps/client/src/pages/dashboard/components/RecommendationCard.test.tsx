import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import type { TrainingPlanningResponse } from "@/models/training-planning"
import { renderWithProviders } from "@/test/render"

import { RecommendationCard } from "./RecommendationCard"

const roleId = "11111111-1111-4111-8111-111111111111"

function response(plan: TrainingPlanningResponse["plan"]): TrainingPlanningResponse {
  return {
    targetRoleId: roleId,
    interactionLanguage: "zh-CN",
    plan,
  }
}

describe("RecommendationCard", () => {
  it("renders a targeted Planner recommendation and keeps weakness priority", async () => {
    renderWithProviders(
      <RecommendationCard
        state={{
          response: response({
            action: "targetedPractice",
            reason: "补强项目结果证据。",
            focusAreas: ["项目结果"],
            questionType: "projectDeepDive",
            difficulty: "basic",
            prioritizeWeaknesses: true,
          }),
          status: "succeeded",
        }}
      />,
      { router: { initialEntries: ["/dashboard"] } },
    )

    expect(await screen.findByText("补强项目结果证据。")).toBeInTheDocument()
    expect(
      await screen.findByText(i18n.t("dashboard.recommendation.prioritizeWeaknesses")),
    ).toBeInTheDocument()
    const link = await screen.findByRole("link", { name: /开始专项训练/ })
    expect(link).toHaveAttribute("href", expect.stringContaining("entry=planner"))
    expect(link).toHaveAttribute("href", expect.stringContaining("source=personalized"))
  })

  it("renders a mock interview plan with its exact duration", async () => {
    renderWithProviders(
      <RecommendationCard
        state={{
          response: response({
            action: "mockInterview",
            reason: "综合练习风险控制和压力应对。",
            focusAreas: ["风险控制"],
            round: "comprehensive",
            difficulty: "pressure",
            durationMinutes: 45,
          }),
          status: "succeeded",
        }}
      />,
      { router: { initialEntries: ["/dashboard"] } },
    )

    expect(await screen.findByText(/45/)).toBeInTheDocument()
    expect(await screen.findByRole("link", { name: /开始模拟面试/ })).toHaveAttribute(
      "href",
      expect.stringContaining("durationMinutes=45"),
    )
  })

  it("renders a retry action for a failed Planner run", async () => {
    const onRetry = vi.fn()
    renderWithProviders(
      <RecommendationCard state={{ status: "failed", isRetrying: false, onRetry }} />,
      { router: { initialEntries: ["/dashboard"] } },
    )

    expect(
      await screen.findByText(i18n.t("dashboard.recommendation.failed.title")),
    ).toBeInTheDocument()
    await screen
      .findByRole("button", {
        name: i18n.t("dashboard.recommendation.failed.retry"),
      })
      .then((button) => button.click())
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
