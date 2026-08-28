import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"
import { ProjectExperienceCard } from "@/pages/profile/components/ProjectExperienceCard"
import { renderWithProviders } from "@/test/render"

type Project = JobProfile["projectExperiences"][number]

function createProject(overrides: Partial<Project> = {}): Project {
  return { ...structuredClone(profileResponseMock.profile!.projectExperiences[0]!), ...overrides }
}

function renderCard(projects: JobProfile["projectExperiences"], onEdit = vi.fn()) {
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

  it("renders each project as a timeline item with a stable article id", () => {
    renderCard([
      createProject({ id: "project_first", name: "First project" }),
      createProject({ id: "project_second", name: "Second project" }),
    ])

    expect(screen.getAllByRole("article")).toHaveLength(2)
    expect(screen.getByTestId("project-experience-item-project_first")).toBeInTheDocument()
    expect(screen.getByTestId("project-experience-item-project_second")).toBeInTheDocument()
    expect(screen.getAllByTestId("project-experience-timeline-node")).toHaveLength(2)
    expect(screen.getAllByRole("article").map((article) => article.textContent)).toEqual([
      expect.stringContaining("First project"),
      expect.stringContaining("Second project"),
    ])
  })

  it("renders the project name, role, localized dates, structured description, and outcomes", () => {
    renderCard([createProject()])

    expect(screen.getByText("Merchant Operations Console")).toBeInTheDocument()
    expect(screen.getByText("Frontend technical lead")).toBeInTheDocument()
    expect(screen.getByText(/2024/)).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.field.projectDescription"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.field.projectAchievements"))).toBeInTheDocument()
  })

  it("renders the project's independent technology stack", () => {
    renderCard([createProject({ technologyStack: ["React", "Rust"] })])

    expect(screen.getByText("React")).toBeInTheDocument()
    expect(screen.getByText("Rust")).toBeInTheDocument()
    expect(
      screen.getByTestId("project-experience-technologies").querySelectorAll('[data-slot="badge"]'),
    ).toHaveLength(2)
    expect(
      screen
        .getByTestId("project-experience-technologies")
        .querySelectorAll('[data-slot="badge"] svg'),
    ).toHaveLength(0)
  })

  it("keeps a project URL available behind a localized link", () => {
    renderCard([createProject({ projectUrl: "https://projects.example.com/merchant-console" })])

    expect(
      screen.getByRole("link", { name: i18n.t("profile.actions.openProject") }),
    ).toHaveAttribute("href", "https://projects.example.com/merchant-console")
  })

  it("renders the present label for an ongoing project", () => {
    renderCard([createProject({ endDate: null })])
    expect(screen.getByText(new RegExp(i18n.t("profile.field.present")))).toBeInTheDocument()
  })

  it("omits empty optional content, its details region, and old project fields", () => {
    renderCard([
      createProject({
        achievements: [],
        projectUrl: null,
        responsibilities: [],
        role: null,
        technologyStack: [],
      }),
    ])

    expect(screen.queryByText(i18n.t("profile.field.projectDescription"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.projectAchievements"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.technologyStack"))).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("project-experience-details-project_merchant_console"),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId("project-experience-technologies")).not.toBeInTheDocument()
    expect(screen.queryByText("关键贡献")).not.toBeInTheDocument()
    expect(screen.queryByText("关联工作经历")).not.toBeInTheDocument()
  })

  it("renders the local empty state", () => {
    renderCard([])
    expect(screen.getAllByText(i18n.t("profile.emptySection"))).toHaveLength(2)
    expect(screen.queryByTestId("project-experience-timeline-node")).not.toBeInTheDocument()
  })

  it("calls onEdit from the card action", async () => {
    const user = userEvent.setup()
    const { onEdit } = renderCard([createProject()])
    const card = screen.getByTestId("profile-section-projectExperience")

    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
