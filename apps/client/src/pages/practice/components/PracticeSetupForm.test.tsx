import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { createPracticeMockResponse } from "@/mocks/data/practice"
import { renderWithProviders } from "@/test/render"

import { PracticeSetupForm } from "./PracticeSetupForm"

describe("PracticeSetupForm", () => {
  it("disables weakness prioritization when the setup capability is unavailable", async () => {
    const response = createPracticeMockResponse("setupReady")
    if (response.session.status !== "setup") throw new Error("Setup fixture required.")
    const onStart = vi.fn(async () => undefined)
    const user = userEvent.setup()

    renderWithProviders(
      <PracticeSetupForm
        context={{ ...response.setupContext, canPrioritizeWeaknesses: false }}
        initialSelection={{ ...response.session.selection, prioritizeWeaknesses: true }}
        isPending={false}
        onStart={onStart}
      />,
      { router: false },
    )

    expect(
      screen.getByRole("switch", {
        name: i18n.t("practice.setup.fields.prioritizeWeaknesses"),
      }),
    ).toHaveAttribute("aria-disabled", "true")

    await user.click(screen.getByRole("button", { name: i18n.t("practice.actions.start") }))

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ prioritizeWeaknesses: false }))
  })

  it("keeps the weakness switch interactive when the mock capability is enabled", async () => {
    const response = createPracticeMockResponse("setupReady")
    if (response.session.status !== "setup") throw new Error("Setup fixture required.")
    const onStart = vi.fn(async () => undefined)
    const user = userEvent.setup()

    renderWithProviders(
      <PracticeSetupForm
        context={response.setupContext}
        initialSelection={response.session.selection}
        isPending={false}
        onStart={onStart}
      />,
      { router: false },
    )

    const weaknessSwitch = screen.getByRole("switch", {
      name: i18n.t("practice.setup.fields.prioritizeWeaknesses"),
    })
    expect(weaknessSwitch).not.toHaveAttribute("aria-disabled", "true")
    await user.click(weaknessSwitch)
    await user.click(screen.getByRole("button", { name: i18n.t("practice.actions.start") }))

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ prioritizeWeaknesses: true }))
  })
})
