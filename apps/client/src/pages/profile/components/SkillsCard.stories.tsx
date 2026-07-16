import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"

import { SkillsCard } from "./SkillsCard"

type Skill = JobProfile["skills"][number]

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    ...structuredClone(profileResponseMock.profile!.skills[0]!),
    ...overrides,
  }
}

const meta = preview.meta({
  component: SkillsCard,
  parameters: { layout: "padded" },
  title: "Profile/SkillsCard",
})

const defaultOnEdit = fn()

export const Default = meta.story({
  args: {
    onEdit: defaultOnEdit,
    skills: structuredClone(profileResponseMock.profile!.skills.slice(0, 4)),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /编辑|edit/i }))
    await expect(defaultOnEdit).toHaveBeenCalledTimes(1)
  },
})

export const Empty = meta.story({
  args: { onEdit: fn(), skills: [] },
})

export const SingleSkill = meta.story({
  args: { onEdit: fn(), skills: [createSkill()] },
})

export const ManySkills = meta.story({
  args: {
    onEdit: fn(),
    skills: [
      createSkill(),
      createSkill({ id: "skill_typescript", name: "TypeScript" }),
      createSkill({ id: "skill_javascript", name: "JavaScript" }),
      createSkill({ id: "skill_design_systems", name: "Design systems" }),
      createSkill({ id: "skill_accessibility", name: "Accessibility" }),
      createSkill({ id: "skill_testing", name: "Testing Library" }),
      createSkill({ id: "skill_query", name: "TanStack Query" }),
      createSkill({ id: "skill_tailwind", name: "Tailwind CSS" }),
      createSkill({ id: "skill_storybook", name: "Storybook" }),
      createSkill({ id: "skill_vite", name: "Vite" }),
    ],
  },
})

export const LongContent = meta.story({
  args: {
    onEdit: fn(),
    skills: [
      createSkill({
        id: "skill_long",
        name: "Cross-functional product engineering, accessibility architecture, and international design-system governance",
      }),
      createSkill({ id: "skill_performance", name: "Frontend performance optimization" }),
    ],
  },
})
