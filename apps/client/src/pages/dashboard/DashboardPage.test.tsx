import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { DashboardPage } from "@/pages/dashboard"
import { renderWithProviders } from "@/test/render"

describe("DashboardPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders the dashboard title", async () => {
    renderWithProviders(<DashboardPage />, { router: false })

    expect(
      await screen.findByRole("heading", { name: i18n.t("dashboard.title") }),
    ).toBeInTheDocument()
  })
})
