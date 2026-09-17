import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { i18n } from "@/i18n/i18n"
import { practiceFixture } from "@/mocks/fixtures/practice"
import { renderWithProviders } from "@/test/render"
import { PracticeReferenceAnswer } from "./PracticeReferenceAnswer"

describe("PracticeReferenceAnswer", () => {
  it("keeps content collapsed until confirmed and allows collapsing it again", async () => {
    const user = userEvent.setup()
    const referenceAnswer = practiceFixture.question.referenceAnswer
    renderWithProviders(<PracticeReferenceAnswer referenceAnswer={referenceAnswer} />, {
      router: false,
    })
    expect(screen.queryByText(referenceAnswer)).toBeNull()
    await user.click(screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.view") }))
    expect(screen.queryByText(referenceAnswer)).toBeNull()
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: i18n.t("practice.referenceAnswer.continueIndependently"),
      }),
    )
    expect(screen.queryByText(referenceAnswer)).toBeNull()
    await user.click(screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.view") }))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: i18n.t("practice.referenceAnswer.confirm"),
      }),
    )
    expect(screen.getByText(referenceAnswer)).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.collapse") }),
    )
    expect(screen.queryByText(referenceAnswer)).toBeNull()
  })
})
