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
  isWeak: false,
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

  it("renders all question actions", () => {
    renderWithProviders(<PracticeQuestionActions {...defaultProps} />, { router: false })

    const actionGroup = screen.getByTestId("practice-question-actions")
    for (const name of [
      i18n.t("practice.questionActions.save"),
      i18n.t("practice.questionActions.markWeak"),
      i18n.t("practice.questionActions.skip"),
      i18n.t("practice.questionActions.end"),
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

  it("uses the same outline style for skip and end actions", () => {
    renderWithProviders(<PracticeQuestionActions {...defaultProps} />, { router: false })

    const skipButton = screen.getByRole("button", {
      name: i18n.t("practice.questionActions.skip"),
    })
    const endButton = screen.getByRole("button", {
      name: i18n.t("practice.questionActions.end"),
    })
    expect(skipButton).toHaveClass("border-border", "bg-background")
    expect(endButton).toHaveClass("border-border", "bg-background")
  })

  it("disables all four actions while interactions are locked", () => {
    renderWithProviders(<PracticeQuestionActions {...defaultProps} interactionLocked />, {
      router: false,
    })

    const actionBar = screen.getByTestId("practice-question-actions-bar")
    for (const name of [
      i18n.t("practice.questionActions.save"),
      i18n.t("practice.questionActions.markWeak"),
      i18n.t("practice.questionActions.skip"),
      i18n.t("practice.questionActions.end"),
    ]) {
      expect(within(actionBar).getByRole("button", { name })).toBeDisabled()
    }
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

  it("keeps an end failure in the dialog and allows a direct retry", async () => {
    const user = userEvent.setup()
    const onEnd = vi
      .fn<() => Promise<"executed">>()
      .mockRejectedValueOnce(new Error("private=secret"))
      .mockResolvedValueOnce("executed")
    renderWithProviders(<PracticeQuestionActions {...defaultProps} onEnd={onEnd} />, {
      router: false,
    })

    await user.click(screen.getByRole("button", { name: i18n.t("practice.questionActions.end") }))
    const dialog = screen.getByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", {
      name: i18n.t("practice.dialog.confirmEnd"),
    })
    await user.click(confirm)

    expect(dialog).toBeVisible()
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.endDescription"),
    )
    expect(within(dialog).queryByText(/private|secret/i)).not.toBeInTheDocument()

    await user.click(confirm)
    expect(onEnd).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })
})
