import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { ProfilePage } from "@/pages/profile"
import { renderWithProviders } from "@/test/render"

describe("ProfilePage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders the profile placeholder title", () => {
    renderWithProviders(<ProfilePage />, { router: false })

    expect(
      screen.getByRole("heading", { name: i18n.t("placeholderPages.profile.title") }),
    ).toBeInTheDocument()
  })
})
