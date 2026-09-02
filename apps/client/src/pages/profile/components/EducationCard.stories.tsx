import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import type { EducationEntryResponse } from "@/api/generated/models"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"

import { EducationCard } from "./EducationCard"

function createEducation(overrides: Partial<EducationEntryResponse> = {}): EducationEntryResponse {
  return { ...structuredClone(careerProfileFixture.education[0]!), ...overrides }
}

const meta = preview.meta({
  component: EducationCard,
  parameters: { layout: "padded" },
  title: "Profile/Education/Card",
})
const onEdit = fn()

export const Default = meta.story({
  args: { education: [createEducation()], onEdit },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /编辑|edit/i }))
    await expect(onEdit).toHaveBeenCalledTimes(1)
  },
})
export const Empty = meta.story({ args: { education: [], onEdit: fn() } })
export const Multiple = meta.story({
  args: {
    education: [createEducation(), createEducation({ school: "Tongji University" })],
    onEdit: fn(),
  },
})
export const Present = meta.story({
  args: { education: [createEducation({ endDate: null })], onEdit: fn() },
})
export const MissingOptionalFields = meta.story({
  args: { education: [createEducation({ degree: null, major: null })], onEdit: fn() },
})
