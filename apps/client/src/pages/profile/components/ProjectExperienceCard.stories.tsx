import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"

import { ProjectExperienceCard } from "./ProjectExperienceCard"

type Project = JobProfile["projectExperiences"][number]
type WorkExperience = JobProfile["workExperiences"][number]

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    ...structuredClone(profileResponseMock.profile!.projectExperiences[0]!),
    ...overrides,
  }
}

function createWorkExperience(overrides: Partial<WorkExperience> = {}): WorkExperience {
  return {
    ...structuredClone(profileResponseMock.profile!.workExperiences[0]!),
    ...overrides,
  }
}

const defaultWorkExperiences = structuredClone(profileResponseMock.profile!.workExperiences)

const meta = preview.meta({
  component: ProjectExperienceCard,
  parameters: { layout: "padded" },
  title: "Profile/ProjectExperienceCard",
})

const defaultOnEdit = fn()

export const Default = meta.story({
  args: {
    onEdit: defaultOnEdit,
    projects: [createProject()],
    workExperiences: structuredClone(defaultWorkExperiences),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /编辑|edit/i }))
    await expect(defaultOnEdit).toHaveBeenCalledTimes(1)
  },
})

export const Empty = meta.story({
  args: { onEdit: fn(), projects: [], workExperiences: structuredClone(defaultWorkExperiences) },
})

export const Multiple = meta.story({
  args: {
    onEdit: fn(),
    projects: [
      createProject(),
      createProject({
        achievements: ["Reduced support response time after rollout."],
        background: "An internal support workspace for global operations teams.",
        contributions: ["Built a reusable case routing system."],
        endDate: "2023-12",
        id: "project_support_workspace",
        name: "Support Operations Workspace",
        relatedWorkExperienceId: "work_orbit_2018",
        responsibilities: ["Owned frontend architecture and delivery."],
        role: "Frontend engineer",
        startDate: "2022-05",
        technologies: ["React", "JavaScript"],
      }),
    ],
    workExperiences: structuredClone(defaultWorkExperiences),
  },
})

export const Ongoing = meta.story({
  args: {
    onEdit: fn(),
    projects: [createProject({ endDate: null })],
    workExperiences: structuredClone(defaultWorkExperiences),
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
        background:
          "A unified workspace connecting merchant support, operational workflows, accessibility requirements, internationalization, observability, and cross-functional delivery across multiple markets.",
        contributions: [
          "Built a configurable workflow renderer shared by six product flows.",
          "Created an accessible interaction framework for dense operational tasks.",
          "Introduced performance monitoring and regression review practices.",
        ],
        name: "International Merchant Operations, Accessibility, and Workflow Intelligence Platform",
        responsibilities: [
          "Defined frontend architecture, delivery milestones, and design-system integration.",
          "Coordinated product, design, quality, data, and platform stakeholders.",
          "Reviewed implementation quality and mentored engineers across teams.",
        ],
        technologies: [
          "React",
          "TypeScript",
          "TanStack Query",
          "Storybook",
          "Testing Library",
          "Web Performance APIs",
        ],
      }),
    ],
    workExperiences: [createWorkExperience()],
  },
})

export const MissingOptionalFields = meta.story({
  args: {
    onEdit: fn(),
    projects: [
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
    workExperiences: [],
  },
})
