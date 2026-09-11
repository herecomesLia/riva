import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderWithProviders } from "@/test/render"

import { PracticeActionErrorAlert, PracticeBottomActionBar } from "./PracticeBottomActionBar"

describe("PracticeBottomActionBar", () => {
  it("provides the shared fixed, sidebar-aware, safe-area and responsive shell", () => {
    renderWithProviders(
      <PracticeBottomActionBar
        actionsTestId="actions"
        ariaLabel="Practice actions"
        error={<PracticeActionErrorAlert description="Try again." />}
        testId="action-bar"
      >
        <button type="button">Action</button>
      </PracticeBottomActionBar>,
      { router: false },
    )

    const actionBar = screen.getByTestId("action-bar")
    expect(actionBar).toHaveClass("fixed", "inset-x-0", "bottom-0", "z-20", "border-t")
    expect(actionBar).toHaveClass(
      "md:left-(--sidebar-width)",
      "md:group-has-data-[collapsible=icon]/sidebar-wrapper:left-(--sidebar-width-icon)",
    )
    expect(actionBar.firstElementChild).toHaveClass("pb-[max(0.75rem,env(safe-area-inset-bottom))]")
    expect(actionBar.querySelector(".max-w-7xl")).toBeInTheDocument()
    expect(screen.getByTestId("actions")).toHaveClass(
      "grid-cols-1",
      "min-[360px]:grid-cols-2",
      "sm:flex",
      "sm:flex-wrap",
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Try again.")
  })
})
