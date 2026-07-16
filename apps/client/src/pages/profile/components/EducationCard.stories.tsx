import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"

import { EducationCard } from "./EducationCard"

type Education = JobProfile["education"][number]

function createEducation(overrides: Partial<Education> = {}): Education {
  return {
    ...structuredClone(profileResponseMock.profile!.education[0]!),
    ...overrides,
  }
}

const meta = preview.meta({
  component: EducationCard,
  parameters: { layout: "padded" },
  title: "Profile/Education/Card",
})

const defaultOnEdit = fn()

export const Default = meta.story({
  args: { education: [createEducation()], onEdit: defaultOnEdit },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /编辑|edit/i }))
    await expect(defaultOnEdit).toHaveBeenCalledTimes(1)
  },
})

export const Empty = meta.story({
  args: { education: [], onEdit: fn() },
})

export const Multiple = meta.story({
  args: {
    education: [
      createEducation(),
      createEducation({
        degree: "Master of Engineering",
        endDate: "2021-06",
        id: "education_tongji_2021",
        major: "Software Engineering",
        school: "Tongji University",
        startDate: "2018-09",
      }),
    ],
    onEdit: fn(),
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Fudan University")).toBeInTheDocument()
    await expect(canvas.queryByText("Tongji University")).not.toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: /上一项|previous/i })).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole("button", { name: /下一项|next/i }))
    await expect(canvas.getByText("Tongji University")).toBeInTheDocument()
    await expect(canvas.queryByText("Fudan University")).not.toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: /下一项|next/i })).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole("button", { name: /上一项|previous/i }))
    await expect(canvas.getByText("Fudan University")).toBeInTheDocument()
  },
})

export const ThreeRecords = meta.story({
  args: {
    education: [
      createEducation(),
      createEducation({
        id: "education_tongji_2021",
        school: "Tongji University",
      }),
      createEducation({
        endDate: "2024-06",
        id: "education_riva_2024",
        school: "Riva University",
        startDate: "2021-09",
      }),
    ],
    onEdit: fn(),
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole("button", { name: /上一项|previous/i })).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: /下一项|next/i })).toBeInTheDocument()

    await userEvent.click(canvas.getByRole("button", { name: /下一项|next/i }))
    await expect(canvas.getByText("Tongji University")).toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: /上一项|previous/i })).toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: /下一项|next/i })).toBeInTheDocument()

    await userEvent.click(canvas.getByRole("button", { name: /下一项|next/i }))
    await expect(canvas.getByText("Riva University")).toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: /上一项|previous/i })).toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: /下一项|next/i })).not.toBeInTheDocument()
  },
})

export const Current = meta.story({
  args: {
    education: [createEducation({ endDate: null, isCurrent: true })],
    onEdit: fn(),
  },
})

export const LongContent = meta.story({
  args: {
    education: [
      createEducation({
        degree:
          "Master of Science in Interdisciplinary Human-Centered Computing and Digital Innovation",
        major:
          "Computer Science, Accessible Product Architecture, and Cross-Functional Design Systems",
        school:
          "Fudan University School of Computer Science and Technology International Innovation Program",
      }),
      createEducation({ id: "education_second", school: "Riva University" }),
    ],
    onEdit: fn(),
  },
})

export const MissingOptionalFields = meta.story({
  args: {
    education: [createEducation({ degree: null, major: null })],
    onEdit: fn(),
  },
})
