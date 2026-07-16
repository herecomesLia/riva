import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"
import { WorkExperienceCard } from "@/pages/profile/components/WorkExperienceCard"
import { renderWithProviders } from "@/test/render"

type WorkExperience = JobProfile["workExperiences"][number]

function createExperience(overrides: Partial<WorkExperience> = {}): WorkExperience {
  return {
    ...structuredClone(profileResponseMock.profile!.workExperiences[0]!),
    ...overrides,
  }
}

function renderCard(
  experiences: JobProfile["workExperiences"],
  skills: JobProfile["skills"] = structuredClone(profileResponseMock.profile!.skills),
  onEdit = vi.fn(),
) {
  return {
    onEdit,
    ...renderWithProviders(
      <WorkExperienceCard experiences={experiences} onEdit={onEdit} skills={skills} />,
      { router: false },
    ),
  }
}

describe("WorkExperienceCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders multiple work experiences", () => {
    renderCard([
      createExperience(),
      createExperience({ company: "Orbit Labs", id: "work_orbit", title: "Frontend Engineer" }),
    ])

    expect(screen.getByText("Senior Frontend Engineer")).toBeInTheDocument()
    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument()
    expect(screen.getByText("Northstar Commerce", { exact: false })).toBeInTheDocument()
    expect(screen.getByText("Orbit Labs", { exact: false })).toBeInTheDocument()
    expect(screen.getAllByTestId("work-experience-timeline-node")).toHaveLength(2)
    expect(screen.getAllByRole("article")).toHaveLength(2)
    expect(screen.getAllByTestId(/work-experience-item-/)).toHaveLength(2)
  })

  it("keeps work experiences in their submitted order", () => {
    renderCard([
      createExperience({ id: "work_first", title: "First role" }),
      createExperience({ id: "work_second", title: "Second role" }),
    ])

    expect(screen.getAllByRole("article").map((article) => article.textContent)).toEqual([
      expect.stringContaining("First role"),
      expect.stringContaining("Second role"),
    ])
  })

  it("maps related skill ids to skill names", () => {
    renderCard([createExperience({ skillIds: ["skill_react", "skill_typescript"] })])

    expect(screen.getByText("React")).toBeInTheDocument()
    expect(screen.getByText("TypeScript")).toBeInTheDocument()
    expect(screen.queryByText("skill_react")).not.toBeInTheDocument()
    expect(
      screen.getByTestId("work-experience-skills").querySelectorAll('[data-slot="badge"]'),
    ).toHaveLength(2)
    expect(
      screen.getByTestId("work-experience-skills").querySelectorAll('[data-slot="badge"] svg'),
    ).toHaveLength(0)
  })

  it("falls back to an unknown skill id", () => {
    renderCard([createExperience({ skillIds: ["skill_unavailable"] })], [])

    expect(screen.getByText("skill_unavailable")).toBeInTheDocument()
  })

  it("renders the present label for current work", () => {
    renderCard([createExperience({ endDate: null, isCurrent: true })])

    expect(screen.getByText(new RegExp(i18n.t("profile.field.present")))).toBeInTheDocument()
  })

  it("renders the local empty state", () => {
    renderCard([])

    expect(screen.getAllByText(i18n.t("profile.emptySection"))).toHaveLength(2)
    expect(screen.queryByTestId("work-experience-timeline-node")).not.toBeInTheDocument()
  })

  it("omits empty optional details without extra separators", () => {
    renderCard([
      createExperience({
        achievements: [],
        location: null,
        responsibilities: [],
        skillIds: [],
      }),
    ])

    expect(screen.getByText("Senior Frontend Engineer")).toBeInTheDocument()
    expect(screen.getByText("Northstar Commerce", { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.responsibilities"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.achievements"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.skills"))).not.toBeInTheDocument()
    expect(screen.queryByTestId("work-experience-skills")).not.toBeInTheDocument()
    expect(screen.queryByText(/·\s*·/)).not.toBeInTheDocument()
  })

  it("shows company, employment type, location, and dates in the metadata row", () => {
    renderCard([createExperience({ location: "Shanghai" })])

    expect(screen.getByText("Northstar Commerce")).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.employmentType.fullTime"))).toBeInTheDocument()
    expect(screen.getByText("Shanghai")).toBeInTheDocument()
    expect(screen.getByText(/2022/)).toBeInTheDocument()
  })

  it("calls onEdit from the card action", async () => {
    const user = userEvent.setup()
    const { onEdit } = renderCard([createExperience()])
    const card = screen.getByTestId("profile-section-workExperience")

    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
