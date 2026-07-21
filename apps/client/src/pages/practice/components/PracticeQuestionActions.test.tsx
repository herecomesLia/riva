import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { renderWithProviders } from "@/test/render"

import { PracticeQuestionActions } from "./PracticeQuestionActions"

const defaultProps = {
  interactionLocked: false,
  isEndPending: false,
  isMarkedWeak: false,
  isSaved: false,
  isSavedPending: false,
  isSkipPending: false,
  isWeakPending: false,
  onEnd: vi.fn(async () => "executed" as const),
  onSetSaved: vi.fn(async () => "executed" as const),
  onSetWeak: vi.fn(async () => "executed" as const),
  onSkip: vi.fn(async () => "executed" as const),
}

describe("PracticeQuestionActions", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.clearAllMocks()
  })

  it.each([
    {
      action: "skip",
      openLabel: "practice.questionActions.skip",
      confirmLabel: "practice.dialog.confirmSkip",
    },
    {
      action: "end",
      openLabel: "practice.questionActions.end",
      confirmLabel: "practice.dialog.confirmEnd",
    },
  ] as const)("keeps the $action dialog open when the interaction is ignored", async (testCase) => {
    const user = userEvent.setup()
    const onSkip = vi.fn(async () => "ignored" as const)
    const onEnd = vi.fn(async () => "ignored" as const)
    renderWithProviders(
      <PracticeQuestionActions {...defaultProps} onEnd={onEnd} onSkip={onSkip} />,
      { router: false },
    )

    await user.click(screen.getByRole("button", { name: i18n.t(testCase.openLabel) }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: i18n.t(testCase.confirmLabel) }))

    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(testCase.action === "skip" ? onSkip : onEnd).toHaveBeenCalledTimes(1)
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()
  })
})
