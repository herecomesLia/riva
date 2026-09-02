import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import type { WorkExperienceEntryResponse } from "@/api/generated/models"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"

import { WorkExperienceCard } from "./WorkExperienceCard"

function createExperience(
  overrides: Partial<WorkExperienceEntryResponse> = {},
): WorkExperienceEntryResponse {
  return { ...structuredClone(careerProfileFixture.workExperiences[0]!), ...overrides }
}

const meta = preview.meta({
  component: WorkExperienceCard,
  parameters: { layout: "padded" },
  title: "Profile/WorkExperience/Card",
})
const onEdit = fn()

export const Default = meta.story({
  args: { experiences: [createExperience()], onEdit },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /编辑|edit/i }))
    await expect(onEdit).toHaveBeenCalledTimes(1)
  },
})
export const Empty = meta.story({ args: { experiences: [], onEdit: fn() } })
export const Multiple = meta.story({
  args: {
    experiences: [
      createExperience(),
      createExperience({ company: "Orbit Labs", endDate: "2022-03", title: "Engineer" }),
    ],
    onEdit: fn(),
  },
})
export const Present = meta.story({
  args: { experiences: [createExperience({ endDate: null })], onEdit: fn() },
})
export const MissingOptionalFields = meta.story({
  args: {
    experiences: [
      createExperience({
        achievements: [],
        employmentType: null,
        location: null,
        responsibilities: [],
        skills: [],
      }),
    ],
    onEdit: fn(),
  },
})
