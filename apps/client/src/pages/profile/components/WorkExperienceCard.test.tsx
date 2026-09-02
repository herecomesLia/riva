import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { WorkExperienceEntryResponse } from "@/api/generated/models"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { WorkExperienceCard } from "@/pages/profile/components/WorkExperienceCard"
import { renderWithProviders } from "@/test/render"

function createExperience(
  overrides: Partial<WorkExperienceEntryResponse> = {},
): WorkExperienceEntryResponse {
  return { ...structuredClone(careerProfileFixture.workExperiences[0]!), ...overrides }
}

function renderCard(experiences: WorkExperienceEntryResponse[], onEdit = vi.fn()) {
  return {
    onEdit,
    ...renderWithProviders(<WorkExperienceCard experiences={experiences} onEdit={onEdit} />, {
      router: false,
    }),
  }
}

describe("WorkExperienceCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders work experiences in order with direct skill names", () => {
    renderCard([
      createExperience({ skills: ["React", "TypeScript"], title: "First role" }),
      createExperience({ company: "Orbit Labs", skills: [], title: "Second role" }),
    ])

    expect(screen.getAllByRole("article").map((article) => article.textContent)).toEqual([
      expect.stringContaining("First role"),
      expect.stringContaining("Second role"),
    ])
    expect(screen.getByText("React")).toBeInTheDocument()
    expect(screen.getByText("TypeScript")).toBeInTheDocument()
    expect(screen.getAllByTestId("work-experience-timeline-node")).toHaveLength(2)
  })

  it("derives present and omits empty optional fields", () => {
    renderCard([
      createExperience({
        achievements: [],
        employmentType: null,
        endDate: null,
        location: null,
        responsibilities: [],
        skills: [],
      }),
    ])

    expect(screen.getByText(new RegExp(i18n.t("profile.field.present")))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.responsibilities"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.achievements"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.skills"))).not.toBeInTheDocument()
  })

  it("renders the generated employment type only when provided", () => {
    renderCard([createExperience({ employmentType: "full-time", location: "Shanghai" })])
    expect(screen.getByText(i18n.t("profile.employmentType.full-time"))).toBeInTheDocument()
    expect(screen.getByText("Shanghai")).toBeInTheDocument()
  })

  it("renders the empty state and edit action", async () => {
    const user = userEvent.setup()
    const empty = renderCard([])
    expect(screen.getAllByText(i18n.t("profile.emptySection"))).toHaveLength(2)
    empty.unmount()

    const { onEdit } = renderCard([createExperience()])
    const card = screen.getByTestId("profile-section-workExperience")
    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
