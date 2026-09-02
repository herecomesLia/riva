import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { careerProfileFixture } from "@/mocks/fixtures/career-profile"

import { SkillsCard } from "./SkillsCard"

const meta = preview.meta({
  component: SkillsCard,
  parameters: { layout: "padded" },
  title: "Profile/Skills/Card",
})
const onEdit = fn()

export const Default = meta.story({
  args: { onEdit, skills: structuredClone(careerProfileFixture.skills) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /编辑|edit/i }))
    await expect(onEdit).toHaveBeenCalledTimes(1)
  },
})
export const Empty = meta.story({ args: { onEdit: fn(), skills: [] } })
export const ManySkills = meta.story({
  args: {
    onEdit: fn(),
    skills: [...careerProfileFixture.skills, "Accessibility", "Storybook", "TanStack Query"],
  },
})
