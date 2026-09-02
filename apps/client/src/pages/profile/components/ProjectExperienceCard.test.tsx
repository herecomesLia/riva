import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ProjectEntryResponse } from "@/api/generated/models"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { ProjectExperienceCard } from "@/pages/profile/components/ProjectExperienceCard"
import { renderWithProviders } from "@/test/render"

function createProject(overrides: Partial<ProjectEntryResponse> = {}): ProjectEntryResponse {
  return { ...structuredClone(careerProfileFixture.projects[0]!), ...overrides }
}

function renderCard(projects: ProjectEntryResponse[], onEdit = vi.fn()) {
  return {
    onEdit,
    ...renderWithProviders(<ProjectExperienceCard onEdit={onEdit} projects={projects} />, {
      router: false,
    }),
  }
}

describe("ProjectExperienceCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders projects in order with response indexes as UI identity", () => {
    renderCard([
      createProject({ name: "First project" }),
      createProject({ name: "Second project" }),
    ])
    expect(screen.getByTestId("project-experience-item-0")).toBeInTheDocument()
    expect(screen.getByTestId("project-experience-item-1")).toBeInTheDocument()
    expect(screen.getAllByRole("article").map((article) => article.textContent)).toEqual([
      expect.stringContaining("First project"),
      expect.stringContaining("Second project"),
    ])
  })

  it("renders description, technology names, and URL", () => {
    renderCard([
      createProject({
        description: ["Project description"],
        techStack: ["React", "Rust"],
        url: "https://projects.example.com/riva",
      }),
    ])

    expect(screen.getByText("Project description")).toBeInTheDocument()
    expect(screen.getByText("React")).toBeInTheDocument()
    expect(screen.getByText("Rust")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: i18n.t("profile.actions.openProject") }),
    ).toHaveAttribute("href", "https://projects.example.com/riva")
  })

  it("derives present and omits empty optional content", () => {
    renderCard([
      createProject({
        achievements: [],
        description: [],
        endDate: null,
        role: null,
        techStack: [],
        url: null,
      }),
    ])
    expect(screen.getByText(new RegExp(i18n.t("profile.field.present")))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.projectDescription"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.techStack"))).not.toBeInTheDocument()
    expect(screen.queryByTestId("project-experience-details-0")).not.toBeInTheDocument()
  })

  it("renders the empty state and edit action", async () => {
    const user = userEvent.setup()
    const empty = renderCard([])
    expect(screen.getAllByText(i18n.t("profile.emptySection"))).toHaveLength(2)
    empty.unmount()

    const { onEdit } = renderCard([createProject()])
    const card = screen.getByTestId("profile-section-projectExperience")
    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
