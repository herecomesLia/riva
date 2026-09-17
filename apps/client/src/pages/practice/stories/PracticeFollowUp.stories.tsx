import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import { createPracticeViewArgs } from "./practice-story-fixtures"
import { PracticeView } from "../PracticeView"

const meta = preview.meta({
  component: PracticeView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/Follow-up",
})

export const SingleFollowUp = meta.story({
  args: createPracticeViewArgs("answeringSingleFollowUp"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-answering-follow-up-state")).toBeVisible()
    await expect(canvas.getAllByRole("textbox")).toHaveLength(1)
  },
})

export const FollowUpWithAssistance = meta.story({
  args: createPracticeViewArgs("answeringSingleFollowUp"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-follow-up-assistance")).toBeVisible()
    await expect(canvas.getByTestId("practice-reference-answer")).toBeVisible()
    await expect(canvas.getAllByRole("button", { name: /查看提示|view hints/i })).toHaveLength(1)
  },
})

export const MultipleFollowUps = meta.story({
  args: createPracticeViewArgs("answeringFollowUp"),
  play: async ({ canvas }) => {
    const timeline = canvas.getByTestId("practice-conversation-timeline")
    await expect(timeline).toBeVisible()
    await expect(timeline).toHaveTextContent(/追问 1|Follow-up 1/i)
    await expect(timeline).toHaveTextContent(/当前追问 2|Current follow-up 2/i)
  },
})

export const WaitingForFollowUp = meta.story({
  args: {
    ...createPracticeViewArgs("answeringFollowUp"),
    followUpPending: {
      end: false,
      interactionLocked: true,
      submit: true,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /正在提交追问回答|submitting follow-up answer/i }),
    ).toBeVisible()
  },
})

const rejectedFollowUp = fn(async () => {
  throw new Error("unsafe story error")
})

export const FollowUpSubmitError = meta.story({
  args: {
    ...createPracticeViewArgs("answeringSingleFollowUp"),
    followUpActions: {
      ...createPracticeViewArgs("answeringSingleFollowUp").followUpActions,
      onSubmitFollowUp: rejectedFollowUp,
    },
  },
  play: async ({ canvas }) => {
    const textbox = canvas.getByRole("textbox")
    await userEvent.type(textbox, "失败后保留的追问回答")
    await userEvent.click(
      canvas.getByRole("button", { name: /提交追问回答|submit follow-up answer/i }),
    )
    await expect(rejectedFollowUp).toHaveBeenCalled()
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(textbox).toHaveValue("失败后保留的追问回答")
  },
})

export const FollowUpCompleted = meta.story({
  args: createPracticeViewArgs("processingAnswer"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-processing-state")).toBeVisible()
    await expect(canvas.getByTestId("practice-conversation-timeline")).toBeVisible()
  },
})
