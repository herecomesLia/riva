import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"

import { ProjectExperienceCard } from "./ProjectExperienceCard"

type Project = JobProfile["projectExperiences"][number]

function createProject(overrides: Partial<Project> = {}): Project {
  return { ...structuredClone(profileResponseMock.profile!.projectExperiences[0]!), ...overrides }
}

const meta = preview.meta({
  component: ProjectExperienceCard,
  parameters: { layout: "padded" },
  title: "Profile/ProjectExperience/Card",
})
const defaultOnEdit = fn()

export const Default = meta.story({
  args: {
    onEdit: defaultOnEdit,
    projects: [createProject()],
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /编辑|edit/i }))
    await expect(defaultOnEdit).toHaveBeenCalledTimes(1)
  },
})

export const Empty = meta.story({ args: { onEdit: fn(), projects: [] } })

export const Multiple = meta.story({
  args: {
    onEdit: fn(),
    projects: [
      createProject(),
      createProject({
        achievements: ["Reduced support response time after rollout."],
        endDate: "2023-12",
        id: "project_support_workspace",
        name: "Support Operations Workspace",
        responsibilities: ["Owned frontend architecture and delivery."],
        role: "Frontend engineer",
        technologyStack: ["React", "JavaScript"],
        startDate: "2022-05",
      }),
    ],
  },
})

export const ThreeProjects = meta.story({
  args: {
    onEdit: fn(),
    projects: [
      createProject(),
      createProject({
        achievements: ["Reduced support response time after rollout."],
        endDate: "2023-12",
        id: "project_support_workspace",
        name: "Support Operations Workspace",
        responsibilities: ["Owned frontend architecture and delivery."],
        role: "Frontend engineer",
        technologyStack: ["React", "JavaScript"],
        startDate: "2022-05",
      }),
      createProject({
        achievements: ["Made adoption progress visible to product teams."],
        endDate: "2022-04",
        id: "project_foundation",
        name: "Engineering Foundation",
        responsibilities: [
          "Established the initial reusable implementation patterns for the product team.",
          "Documented the team workflow and component conventions.",
        ],
        role: "Frontend engineer",
        technologyStack: ["TypeScript"],
        startDate: "2021-09",
      }),
    ],
  },
})

export const Ongoing = meta.story({
  args: {
    onEdit: fn(),
    projects: [createProject({ endDate: null })],
  },
})

export const MissingRole = meta.story({
  args: {
    onEdit: fn(),
    projects: [createProject({ role: null })],
  },
})

export const LongContent = meta.story({
  args: {
    onEdit: fn(),
    projects: [
      createProject({
        achievements: [
          "Reduced average case handling time across multiple international merchant segments.",
          "Improved accessibility and performance for the highest-volume workflows.",
          "Established measurable adoption and reliability standards for shared components.",
        ],
        name: "International Merchant Operations, Accessibility, and Workflow Intelligence Platform",
        projectUrl:
          "https://projects.example.com/international-merchant-operations-accessibility-workflow-intelligence-platform",
        responsibilities: [
          "Defined frontend architecture, delivery milestones, and design-system integration.",
          "Coordinated product, design, quality, data, and platform stakeholders.",
          "Reviewed implementation quality and mentored engineers across teams.",
        ],
        role: "Principal frontend engineer for cross-functional platform delivery",
        technologyStack: ["React", "TypeScript", "TanStack Query", "Storybook", "Testing Library"],
      }),
    ],
  },
})

export const MissingOptionalFields = meta.story({
  args: {
    onEdit: fn(),
    projects: [
      createProject({
        achievements: [],
        projectUrl: null,
        responsibilities: [],
        role: null,
        technologyStack: [],
      }),
    ],
  },
})
