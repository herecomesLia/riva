import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import {
  createInterviewSessionStoryFixture,
  createLongCandidateExchangesStoryFixture,
} from "../stories/interview-story-fixtures"
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

export const SubmittingQuestion = meta.story({
  args: {
    ...defaultArgs,
    isInteractionLocked: true,
    isSubmittingQuestion: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox")).toBeDisabled()
  },
})

export const Finishing = meta.story({
  args: {
    ...defaultArgs,
    isFinishing: true,
    isInteractionLocked: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /完成面试|finish interview/i })).toBeDisabled()
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

export const FinishFailure = meta.story({
  args: {
    ...defaultArgs,
    onFinish: fn(async () => {
      throw new Error("finish failed")
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /完成面试|finish interview/i }))
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: /完成并生成复盘|finish and generate review/i,
      }),
    )
    await expect(within(dialog).getByRole("alert")).toBeVisible()
  },
})

export const MultipleLongExchanges = meta.story({
  args: {
    ...defaultArgs,
    exchanges: createLongCandidateExchangesStoryFixture(),
  },
  play: async ({ canvas }) => {
    const exchanges = createLongCandidateExchangesStoryFixture()
    await expect(canvas.getByText(exchanges[0]!.question.content)).toBeVisible()
    await expect(canvas.getByText(exchanges[2]!.question.content)).toBeVisible()
  },
})

export const Mobile = meta.story({
  args: {
    ...defaultArgs,
    exchanges: createLongCandidateExchangesStoryFixture(),
  },
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox")).toBeVisible()
    await expect(canvas.getByRole("button", { name: /完成面试|finish interview/i })).toBeVisible()
  },
})
