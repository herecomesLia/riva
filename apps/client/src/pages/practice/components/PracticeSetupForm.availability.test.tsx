import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import type { PracticeSetupContext, PracticeSetupSelection } from "@/models/practice"
import { renderWithProviders } from "@/test/render"

import { PracticeSetupForm } from "./PracticeSetupForm"

const roleAId = "11111111-1111-4111-8111-111111111111"
const roleBId = "22222222-2222-4222-8222-222222222222"

const context: PracticeSetupContext = {
  availability: { status: "available" },
  availableDifficulties: ["basic", "pressure"],
  canPrioritizeWeaknesses: false,
  personalizedQuestionGenerationTargetRoleIds: [roleAId, roleBId],
  defaultTargetRoleId: roleAId,
  eligibleQuestionCounts: { history: 8, saved: 9 },
  questionSourceAvailability: [
    {
      difficulty: "basic",
      historyQuestionCount: 0,
      questionType: "projectDeepDive",
      savedQuestionCount: 1,
      targetRoleId: roleAId,
    },
  ],
  targetRoles: [
    {
      company: null,
      id: roleAId,
      supportedQuestionTypes: ["projectDeepDive", "behavioral"],
      title: "Role A",
    },
    {
      company: null,
      id: roleBId,
      supportedQuestionTypes: ["projectDeepDive", "behavioral"],
      title: "Role B",
    },
  ],
}

const selection: PracticeSetupSelection = {
  difficulty: "basic",
  prioritizeWeaknesses: false,
  questionType: "projectDeepDive",
  source: "saved",
  targetRoleId: roleAId,
}

function renderForm(
  initialSelection: PracticeSetupSelection,
  onStart = vi.fn(async () => undefined),
  setupContext = context,
) {
  renderWithProviders(
    <PracticeSetupForm
      context={setupContext}
      initialSelection={initialSelection}
      isPending={false}
      onStart={onStart}
    />,
    { router: false },
  )
  return onStart
}

function startButton() {
  return screen.getByRole("button", { name: i18n.t("practice.actions.start") })
}

describe("PracticeSetupForm selection-aware source availability", () => {
  it.each(["saved", "history"] as const)(
    "disables an unavailable %s source even when its aggregate count is positive",
    async (source) => {
      const onStart = renderForm({ ...selection, source, targetRoleId: roleBId })
      const user = userEvent.setup()

      expect(screen.getByTestId(`practice-no-${source}-questions`)).toBeInTheDocument()
      expect(startButton()).toBeDisabled()
      await user.click(startButton())
      expect(onStart).not.toHaveBeenCalled()
    },
  )

  it("allows the saved source only for its exact role, question type, and difficulty", async () => {
    const onStart = renderForm(selection)
    const user = userEvent.setup()

    expect(screen.queryByTestId("practice-no-saved-questions")).not.toBeInTheDocument()
    expect(startButton()).toBeEnabled()
    await user.click(startButton())
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining(selection))
  })

  it.each([
    {
      name: "role",
      switchSelection: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByTestId("practice-target-role-trigger"))
        await user.click(screen.getByRole("option", { name: "Role B" }))
      },
    },
    {
      name: "difficulty",
      switchSelection: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(
          screen.getByRole("button", { name: i18n.t("practice.difficulty.pressure") }),
        )
      },
    },
    {
      name: "question type",
      switchSelection: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(
          screen.getByRole("button", {
            name: i18n.t("practice.questionTypes.behavioral"),
          }),
        )
      },
    },
  ])(
    "keeps saved selected and blocks submission after switching $name",
    async ({ switchSelection }) => {
      const onStart = renderForm(selection)
      const user = userEvent.setup()

      await switchSelection(user)

      expect(
        screen.getByRole("button", { name: i18n.t("practice.sources.saved") }),
      ).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByTestId("practice-no-saved-questions")).toBeInTheDocument()
      expect(startButton()).toBeDisabled()
      await user.click(startButton())
      expect(onStart).not.toHaveBeenCalled()
    },
  )

  it("keeps personalized generation available without saved or history candidates", async () => {
    const personalized = {
      ...selection,
      difficulty: "pressure" as const,
      questionType: "behavioral" as const,
      source: "personalized" as const,
      targetRoleId: roleBId,
    }
    const onStart = renderForm(personalized)
    const user = userEvent.setup()

    expect(startButton()).toBeEnabled()
    await user.click(startButton())
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining(personalized))
  })

  it("keeps personalized generation disabled when matching is not ready", async () => {
    const personalized = {
      ...selection,
      source: "personalized" as const,
      targetRoleId: roleBId,
    }
    const onStart = vi.fn(async () => undefined)
    renderForm(personalized, onStart, {
      ...context,
      personalizedQuestionGenerationTargetRoleIds: [roleAId],
    })
    const user = userEvent.setup()

    expect(screen.getByTestId("practice-no-personalized-questions")).toBeInTheDocument()
    expect(startButton()).toBeDisabled()
    await user.click(startButton())
    expect(onStart).not.toHaveBeenCalled()
  })
})
