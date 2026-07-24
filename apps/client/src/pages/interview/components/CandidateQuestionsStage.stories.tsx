import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import { createInterviewSessionStoryFixture } from "../stories/interview-story-fixtures"
import { CandidateQuestionsStage } from "./CandidateQuestionsStage"

const fixture = createInterviewSessionStoryFixture()

const meta = preview.meta({
  component: CandidateQuestionsStage,
  title: "Interview/CandidateQuestionsStage",
})

const defaultArgs = {
  exchanges: [fixture.candidateExchange],
  isFinishing: false,
  isInteractionLocked: false,
  isSubmittingQuestion: false,
  onFinish: fn(async () => undefined),
  onSubmitQuestion: fn(async () => undefined),
  prompt: fixture.candidatePrompt,
}

export const WithFeedback = meta.story({
  args: defaultArgs,
})

export const NoQuestionsYet = meta.story({
  args: {
    ...defaultArgs,
    exchanges: [],
  },
})

const finishInterview = fn(async () => undefined)

export const FinishConfirmation = meta.story({
  args: {
    ...defaultArgs,
    onFinish: finishInterview,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /完成面试|finish interview/i }))
    const dialog = await screen.findByRole("alertdialog")
    await expect(dialog).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: /完成并生成复盘|finish and generate review/i,
      }),
    )
    await expect(finishInterview).toHaveBeenCalledTimes(1)
  },
})
