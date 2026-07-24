import preview from "#storybook/preview"
import { expect } from "storybook/test"

import { createInterviewReviewResponseMock } from "@/mocks/data/interview"

import { InterviewDimensionScores } from "./InterviewDimensionScores"

const response = createInterviewReviewResponseMock()
if (response.status !== "complete") throw new Error("Complete review fixture required.")

const meta = preview.meta({
  component: InterviewDimensionScores,
  title: "Interview/InterviewDimensionScores",
})

export const Default = meta.story({
  args: { review: response.review },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("个人贡献")).toBeVisible()
    await expect(canvas.getByText("结果与证据")).toBeVisible()
  },
})
