import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const focusRingClassPattern = /(?:^|\s)focus(?:-visible|-within)?:\S*ring\S*/

describe("Card focus styles", () => {
  it("does not add focus ring classes to a presentational Card", () => {
    render(<Card data-testid="display-card" />)

    const card = screen.getByTestId("display-card")
    expect(card).not.toHaveAttribute("tabindex")
    expect(card.className).not.toMatch(focusRingClassPattern)
  })

  it("keeps focus-visible styles on a keyboard-operable Card wrapper", async () => {
    const user = userEvent.setup()
    render(
      <Button nativeButton={false} render={<a href="/details" />}>
        <Card data-testid="interactive-card" size="sm">
          <CardContent>Open details</CardContent>
        </Card>
      </Button>,
    )

    const action = screen.getByRole("button", { name: "Open details" })
    await user.tab()
    expect(action).toHaveFocus()
    expect(action).toHaveClass(
      "focus-visible:border-ring",
      "focus-visible:ring-3",
      "focus-visible:ring-ring/50",
    )
    expect(within(action).getByTestId("interactive-card").className).not.toMatch(
      focusRingClassPattern,
    )
  })
})
