import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"
import { SkillsCard } from "@/pages/profile/components/SkillsCard"
import { renderWithProviders } from "@/test/render"

type Skill = JobProfile["skills"][number]

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    ...structuredClone(profileResponseMock.profile!.skills[0]!),
    ...overrides,
  }
}

function renderCard(skills: JobProfile["skills"], onEdit = vi.fn()) {
  return {
    onEdit,
    ...renderWithProviders(<SkillsCard onEdit={onEdit} skills={skills} />, { router: false }),
  }
}

describe("SkillsCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders every skill as a badge with the unified decorative icon", () => {
    const skills = [createSkill(), createSkill({ id: "skill_typescript", name: "TypeScript" })]
    const { container } = renderCard(skills)

    expect(screen.getByText("React")).toBeInTheDocument()
    expect(screen.getByText("TypeScript")).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="badge"] svg[aria-hidden="true"]')).toHaveLength(
      2,
    )
  })

  it("renders the local empty state", () => {
    renderCard([])

    expect(screen.getAllByText(i18n.t("profile.emptySection"))).toHaveLength(2)
  })

  it("renders a long skill name without changing its text", () => {
    const longName =
      "Cross-functional product engineering, accessibility architecture, and design-system governance"
    renderCard([createSkill({ name: longName })])

    expect(screen.getByText(longName)).toBeInTheDocument()
  })

  it("calls onEdit from the card action", async () => {
    const user = userEvent.setup()
    const { onEdit } = renderCard([createSkill()])
    const card = screen.getByTestId("profile-section-skills")

    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
