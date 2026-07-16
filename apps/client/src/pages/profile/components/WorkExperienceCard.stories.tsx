import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"

import { WorkExperienceCard } from "./WorkExperienceCard"

type Skill = JobProfile["skills"][number]
type WorkExperience = JobProfile["workExperiences"][number]

function createExperience(overrides: Partial<WorkExperience> = {}): WorkExperience {
  return {
    ...structuredClone(profileResponseMock.profile!.workExperiences[0]!),
    ...overrides,
  }
}

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    ...structuredClone(profileResponseMock.profile!.skills[0]!),
    ...overrides,
  }
}

const defaultSkills = structuredClone(profileResponseMock.profile!.skills)

const meta = preview.meta({
  component: WorkExperienceCard,
  parameters: { layout: "padded" },
  title: "Profile/WorkExperienceCard",
})

const defaultOnEdit = fn()

export const Default = meta.story({
  args: {
    experiences: [createExperience()],
    onEdit: defaultOnEdit,
    skills: structuredClone(defaultSkills),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /编辑|edit/i }))
    await expect(defaultOnEdit).toHaveBeenCalledTimes(1)
  },
})

export const Empty = meta.story({
  args: { experiences: [], onEdit: fn(), skills: structuredClone(defaultSkills) },
})

export const Multiple = meta.story({
  args: {
    experiences: [
      createExperience(),
      createExperience({
        achievements: ["Introduced a reusable charting foundation used by four teams."],
        company: "Orbit Labs",
        endDate: "2022-03",
        id: "work_orbit_2018",
        isCurrent: false,
        location: "Hangzhou",
        responsibilities: ["Built operational dashboards for enterprise users."],
        skillIds: ["skill_react", "skill_javascript"],
        startDate: "2018-07",
        title: "Frontend Engineer",
      }),
    ],
    onEdit: fn(),
    skills: structuredClone(defaultSkills),
  },
})

export const Current = meta.story({
  args: {
    experiences: [createExperience({ endDate: null, isCurrent: true })],
    onEdit: fn(),
    skills: structuredClone(defaultSkills),
  },
})

export const LongContent = meta.story({
  args: {
    experiences: [
      createExperience({
        achievements: [
          "Improved accessibility compliance across every customer-facing workflow.",
          "Reduced the largest workflow completion time while increasing successful task completion.",
          "Created measurable engineering standards adopted by multiple product teams.",
        ],
        company:
          "Northstar International Commerce and Cross-Functional Digital Experience Organization",
        responsibilities: [
          "Led frontend delivery for merchant workflow products across several international markets.",
          "Maintained the shared component library, accessibility standards, and performance budgets.",
          "Coordinated product, design, data, quality, and platform stakeholders through delivery.",
        ],
        skillIds: ["skill_react", "skill_typescript", "skill_accessibility", "skill_design"],
        title:
          "Principal Frontend Product Engineer for Accessible Merchant Operations and Design Systems",
      }),
    ],
    onEdit: fn(),
    skills: [
      createSkill(),
      createSkill({ id: "skill_typescript", name: "TypeScript" }),
      createSkill({ id: "skill_accessibility", name: "Accessibility architecture" }),
      createSkill({ id: "skill_design", name: "Design-system governance" }),
    ],
  },
})

export const MissingOptionalFields = meta.story({
  args: {
    experiences: [
      createExperience({
        achievements: [],
        location: null,
        responsibilities: [],
        skillIds: [],
      }),
    ],
    onEdit: fn(),
    skills: [],
  },
})
