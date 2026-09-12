import preview from "#storybook/preview"
import { expect } from "storybook/test"

import { createPracticeReviewStoryFixture } from "../stories/practice-story-fixtures"
import { PracticeScoreOverview } from "./PracticeScoreOverview"

function createArgs(variant: Parameters<typeof createPracticeReviewStoryFixture>[0]) {
  const { evaluation } = createPracticeReviewStoryFixture(variant)
  return { evaluation }
}

const meta = preview.meta({
  component: PracticeScoreOverview,
  title: "Practice/PracticeScoreOverview",
})

export const HighScore = meta.story({
  args: createArgs("highScore"),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(/总分|overall score/i)).toHaveTextContent("94")
  },
})

export const LowScore = meta.story({
  args: createArgs("lowScore"),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(/总分|overall score/i)).toHaveTextContent("58")
  },
})

export const BoundaryScore = meta.story({
  args: createArgs("boundaryScore"),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(/总分|overall score/i)).toHaveTextContent("60")
  },
})

export const InEnglish = meta.story({
  args: createArgs("balanced"),
  globals: { locale: "en" },
})
