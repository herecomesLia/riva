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
  return {
    ...structuredClone(profileResponseMock.profile!.projectExperiences[0]!),
    ...overrides,
  }
}

function renderCard(
  projects: JobProfile["projectExperiences"],
  workExperiences: JobProfile["workExperiences"] = structuredClone(
    profileResponseMock.profile!.workExperiences,
  ),
  onEdit = vi.fn(),
) {
  return {
    onEdit,
    ...renderWithProviders(
      <ProjectExperienceCard
        onEdit={onEdit}
        projects={projects}
        workExperiences={workExperiences}
      />,
      { router: false },
    ),
  }
}

describe("ProjectExperienceCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders multiple projects", () => {
    renderCard([
      createProject(),
      createProject({ id: "project_support", name: "Support Operations Workspace" }),
    ])

    expect(screen.getByText("Merchant Operations Console")).toBeInTheDocument()
    expect(screen.getByText("Support Operations Workspace")).toBeInTheDocument()
  })

  it("renders the related work experience company", () => {
    renderCard([createProject({ relatedWorkExperienceId: "work_northstar_2022" })])

    expect(screen.getByText("Northstar Commerce")).toBeInTheDocument()
  })

  it("renders the present label for an ongoing project", () => {
    renderCard([createProject({ endDate: null })])

    expect(screen.getByText(new RegExp(i18n.t("profile.field.present")))).toBeInTheDocument()
  })

  it("renders every technology", () => {
    renderCard([createProject({ technologies: ["React", "TypeScript", "Storybook"] })])

    expect(screen.getByText("React")).toBeInTheDocument()
    expect(screen.getByText("TypeScript")).toBeInTheDocument()
    expect(screen.getByText("Storybook")).toBeInTheDocument()
  })

  it("renders the local empty state", () => {
    renderCard([])

    expect(screen.getAllByText(i18n.t("profile.emptySection"))).toHaveLength(2)
  })

  it("omits empty optional details", () => {
    renderCard(
      [
        createProject({
          achievements: [],
          background: null,
          contributions: [],
          relatedWorkExperienceId: null,
          responsibilities: [],
          role: null,
          technologies: [],
        }),
      ],
      [],
    )

    expect(screen.getByText("Merchant Operations Console")).toBeInTheDocument()
    expect(screen.queryByText("Frontend technical lead")).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.responsibilities"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.contributions"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.field.achievements"))).not.toBeInTheDocument()
  })

  it("calls onEdit from the card action", async () => {
    const user = userEvent.setup()
    const { onEdit } = renderCard([createProject()])
    const card = screen.getByTestId("profile-section-projectExperience")

    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
