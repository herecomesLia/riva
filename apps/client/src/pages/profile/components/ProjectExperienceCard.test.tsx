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

function renderCard(
  projects: JobProfile["projectExperiences"],
  skills = structuredClone(profileResponseMock.profile!.skills),
  onEdit = vi.fn(),
) {
  return {
    onEdit,
    ...renderWithProviders(
      <ProjectExperienceCard onEdit={onEdit} projects={projects} skills={skills} />,
      {
        router: false,
      },
    ),
  }
}

describe("ProjectExperienceCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("maps skill ids to ProfileSkillBadge names and falls back to unknown ids", () => {
    renderCard([createProject({ skillIds: ["skill_react", "skill_unavailable"] })])

    expect(screen.getByText("React")).toBeInTheDocument()
    expect(screen.getByText("skill_unavailable")).toBeInTheDocument()
  })

  it("keeps a project URL available behind a localized link", () => {
    renderCard([createProject({ projectUrl: "https://projects.example.com/merchant-console" })])

    expect(
      screen.getByRole("link", { name: i18n.t("profile.actions.openProject") }),
    ).toHaveAttribute("href", "https://projects.example.com/merchant-console")
  })

  it("omits empty optional content, its details region, and old project fields", () => {
    renderCard([
      createProject({
        achievements: [],
        projectUrl: null,
        responsibilities: [],
        role: null,
        skillIds: [],
      }),
    ])

    expect(screen.queryByText(i18n.t("profile.field.projectDescription"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.projectAchievements"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.technologyStack"))).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("project-experience-details-project_merchant_console"),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId("project-experience-skills")).not.toBeInTheDocument()
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
