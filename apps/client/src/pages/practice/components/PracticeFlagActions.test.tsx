import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { renderWithProviders } from "@/test/render"

import { PracticeFlagActions } from "./PracticeFlagActions"

const defaultProps = {
  disabled: false,
  isMarkedWeak: false,
  isSaved: false,
  isSavedPending: false,
  isWeakPending: false,
  onSavedClick: vi.fn(),
  onWeakClick: vi.fn(),
  variant: "outline" as const,
}

describe("PracticeFlagActions", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.clearAllMocks()
  })

  it("uses consistent icons, pressed state and callbacks", async () => {
    const user = userEvent.setup()
    renderWithProviders(<PracticeFlagActions {...defaultProps} isMarkedWeak isSaved />, {
      router: false,
    })

    const saved = screen.getByRole("button", {
      name: i18n.t("practice.questionActions.unsave"),
    })
    const weak = screen.getByRole("button", {
      name: i18n.t("practice.questionActions.unmarkWeak"),
    })
    expect(saved).toHaveAttribute("aria-pressed", "true")
    expect(weak).toHaveAttribute("aria-pressed", "true")
    expect(saved.querySelector(".lucide-bookmark")).toHaveClass(
      "fill-destructive",
      "text-destructive",
    )
    expect(weak.querySelector(".lucide-brain")).toHaveClass("text-amber-500")

    await user.click(saved)
    await user.click(weak)
    expect(defaultProps.onSavedClick).toHaveBeenCalledOnce()
    expect(defaultProps.onWeakClick).toHaveBeenCalledOnce()
  })

  it("shows spinners and disables both actions while locked", () => {
    renderWithProviders(
      <PracticeFlagActions {...defaultProps} disabled isSavedPending isWeakPending />,
      { router: false },
    )

    const saved = screen.getByRole("button", {
      name: i18n.t("practice.questionActions.save"),
    })
    const weak = screen.getByRole("button", {
      name: i18n.t("practice.questionActions.markWeak"),
    })
    expect(saved).toBeDisabled()
    expect(weak).toBeDisabled()
    expect(saved.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
    expect(weak.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
    expect(saved.querySelector(".lucide-bookmark")).not.toBeInTheDocument()
    expect(weak.querySelector(".lucide-brain")).not.toBeInTheDocument()
  })
})
