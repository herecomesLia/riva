import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import type { ProjectEntryResponse } from "@/api/generated/models"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"

import { ProjectExperienceCard } from "./ProjectExperienceCard"

function createProject(overrides: Partial<ProjectEntryResponse> = {}): ProjectEntryResponse {
  return { ...structuredClone(careerProfileFixture.projects[0]!), ...overrides }
}

const meta = preview.meta({
  component: ProjectExperienceCard,
  parameters: { layout: "padded" },
  title: "Profile/ProjectExperience/Card",
})
const onEdit = fn()

export const Default = meta.story({
  args: { onEdit, projects: [createProject()] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /编辑|edit/i }))
    await expect(onEdit).toHaveBeenCalledTimes(1)
  },
})
export const Empty = meta.story({ args: { onEdit: fn(), projects: [] } })
export const Multiple = meta.story({
  args: {
    onEdit: fn(),
    projects: [
      createProject(),
      createProject({ endDate: "2023-12", name: "Support Operations Workspace" }),
    ],
  },
})
export const Present = meta.story({
  args: { onEdit: fn(), projects: [createProject({ endDate: null })] },
})
export const MissingOptionalFields = meta.story({
  args: {
    onEdit: fn(),
    projects: [
      createProject({ achievements: [], description: [], role: null, techStack: [], url: null }),
    ],
  },
})
