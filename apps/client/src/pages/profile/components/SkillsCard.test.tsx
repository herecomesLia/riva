import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { SkillsCard } from "@/pages/profile/components/SkillsCard"
import { renderWithProviders } from "@/test/render"

function renderCard(skills: string[], onEdit = vi.fn()) {
  return {
    onEdit,
    ...renderWithProviders(<SkillsCard onEdit={onEdit} skills={skills} />, { router: false }),
  }
}

describe("SkillsCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders direct skill names as badges", () => {
    const { container } = renderCard(["React", "TypeScript"])
    expect(screen.getByText("React")).toBeInTheDocument()
    expect(screen.getByText("TypeScript")).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="badge"] svg[aria-hidden="true"]')).toHaveLength(
      2,
    )
  })

  it("renders a long skill name without changing its text", () => {
    const name = "Cross-functional product engineering and accessibility architecture"
    renderCard([name])
    expect(screen.getByText(name)).toBeInTheDocument()
  })

  it("renders the empty state and edit action", async () => {
    const user = userEvent.setup()
    const empty = renderCard([])
    expect(screen.getAllByText(i18n.t("profile.emptySection"))).toHaveLength(2)
    empty.unmount()

    const { onEdit } = renderCard(["React"])
    const card = screen.getByTestId("profile-section-skills")
    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
