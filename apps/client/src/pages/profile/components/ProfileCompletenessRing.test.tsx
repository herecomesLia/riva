import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { ProfileCompletenessRing } from "@/pages/profile/components/ProfileCompletenessRing"
import { renderWithProviders } from "@/test/render"

describe("ProfileCompletenessRing", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it.each([
    { expected: 0, value: -20 },
    { expected: 0, value: 0 },
    { expected: 75, value: 75 },
    { expected: 100, value: 100 },
    { expected: 100, value: 120 },
  ])("clamps $value to $expected", async ({ expected, value }) => {
    renderWithProviders(<ProfileCompletenessRing value={value} />, { router: false })

    const progressbar = screen.getByRole("progressbar", {
      name: i18n.t("profile.completeness"),
    })
    expect(progressbar).toHaveAttribute("aria-valuenow", String(expected))
    expect(screen.getByText(`${expected}%`)).toBeInTheDocument()
  })

  it.each([
    { language: "zh-CN", visibleLabel: "档案完整度" },
    { language: "en", visibleLabel: "Completeness" },
  ])(
    "uses the short visible label while preserving the full $language accessible label",
    async ({ language, visibleLabel }) => {
      await i18n.changeLanguage(language)
      renderWithProviders(<ProfileCompletenessRing value={75} />, { router: false })

      expect(screen.getByText(visibleLabel)).toBeInTheDocument()
      expect(
        screen.getByRole("progressbar", { name: i18n.t("profile.completeness") }),
      ).toHaveAttribute("aria-valuenow", "75")
    },
  )
})
