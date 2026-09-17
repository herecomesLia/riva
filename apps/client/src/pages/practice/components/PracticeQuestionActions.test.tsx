import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { renderWithProviders } from "@/test/render"

import { PracticeQuestionActions } from "./PracticeQuestionActions"

const defaultProps = {
  interactionLocked: false,
  isWeak: false,
  isSaved: false,
  isSavedPending: false,
  isSkipPending: false,
  isWeakPending: false,
  onSetSaved: vi.fn(async () => "executed" as const),
  onSetWeak: vi.fn(async () => "executed" as const),
  onSkip: vi.fn(async () => "executed" as const),
}

describe("PracticeQuestionActions", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.clearAllMocks()
  })

  it("renders all question actions", () => {
    renderWithProviders(<PracticeQuestionActions {...defaultProps} />, { router: false })

    const actionGroup = screen.getByTestId("practice-question-actions")
    for (const name of [
      i18n.t("practice.questionActions.save"),
      i18n.t("practice.questionActions.markWeak"),
      i18n.t("practice.questionActions.skip"),
    ]) {
      expect(within(actionGroup).getByRole("button", { name })).toBeInTheDocument()
    }
  })

  it("fills the saved bookmark red and colors the marked-weak icon amber", () => {
    const { rerender } = renderWithProviders(<PracticeQuestionActions {...defaultProps} />, {
      router: false,
    })

    const unsavedIcon = screen
      .getByRole("button", { name: i18n.t("practice.questionActions.save") })
      .querySelector(".lucide-bookmark")
    const unmarkedWeakIcon = screen
      .getByRole("button", { name: i18n.t("practice.questionActions.markWeak") })
      .querySelector(".lucide-brain")
    expect(unsavedIcon).not.toHaveClass("fill-destructive", "text-destructive")
    expect(unmarkedWeakIcon).not.toHaveClass("text-amber-500")

    rerender(<PracticeQuestionActions {...defaultProps} isWeak isSaved />)

    const savedIcon = screen
      .getByRole("button", { name: i18n.t("practice.questionActions.unsave") })
      .querySelector(".lucide-bookmark")
    const markedWeakIcon = screen
      .getByRole("button", { name: i18n.t("practice.questionActions.unmarkWeak") })
      .querySelector(".lucide-brain")
    expect(savedIcon).toHaveClass("fill-destructive", "text-destructive")
    expect(markedWeakIcon).toHaveClass("text-amber-500")
    expect(markedWeakIcon).not.toHaveClass("fill-amber-500")
  })

  it("does not offer ending a session before review", () => {
    renderWithProviders(<PracticeQuestionActions {...defaultProps} />, { router: false })
    expect(screen.queryByRole("button", { name: i18n.t("practice.review.endSession") })).toBeNull()
  })

  it("disables all actions while interactions are locked", () => {
    renderWithProviders(<PracticeQuestionActions {...defaultProps} interactionLocked />, {
      router: false,
    })

    const actionBar = screen.getByTestId("practice-question-actions-bar")
    for (const name of [
      i18n.t("practice.questionActions.save"),
      i18n.t("practice.questionActions.markWeak"),
      i18n.t("practice.questionActions.skip"),
    ]) {
      expect(within(actionBar).getByRole("button", { name })).toBeDisabled()
    }
  })

  it("keeps the skip dialog open when the interaction is ignored", async () => {
    const user = userEvent.setup()
    const onSkip = vi.fn(async () => "ignored" as const)
    renderWithProviders(<PracticeQuestionActions {...defaultProps} onSkip={onSkip} />, {
      router: false,
    })
    await user.click(screen.getByRole("button", { name: i18n.t("practice.questionActions.skip") }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("practice.dialog.confirmSkip") }),
    )
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()
  })
})
