import preview from "#storybook/preview"
import { expect, fn, userEvent, within } from "storybook/test"

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
    await expect(canvas.getAllByTestId("practice-follow-up-guidance-card")).toHaveLength(2)
    await expect(canvas.getByTestId("practice-follow-up-reference")).toBeVisible()
    await expect(
      canvas.getAllByRole("button", { name: /查看追问提示|view follow-up hint/i }),
    ).toHaveLength(1)
  },
})

export const FollowUpHintPending = meta.story({
  args: {
    ...createPracticeViewArgs("answeringSingleFollowUp"),
    followUpPending: {
      end: false,
      framework: false,
      hint: true,
      interactionLocked: true,
      referenceAnswer: false,
      submit: false,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /正在生成追问提示|generating follow-up hint/i }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole("button", { name: /提交追问回答|submit follow-up answer/i }),
    ).toBeDisabled()
    await expect(canvas.getByRole("textbox")).toBeEnabled()
  },
})

export const FollowUpReferencePending = meta.story({
  args: {
    ...createPracticeViewArgs("answeringSingleFollowUp"),
    followUpPending: {
      end: false,
      framework: false,
      hint: false,
      interactionLocked: true,
      referenceAnswer: true,
      submit: false,
    },
  },
})

export const FollowUpReferenceError = meta.story({
  args: {
    ...createPracticeViewArgs("answeringSingleFollowUp"),
    followUpActions: {
      ...createPracticeViewArgs("answeringSingleFollowUp").followUpActions,
      onRequestReferenceAnswer: fn(async () => {
        throw new Error("internal private=secret stack")
      }),
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox"), "保留草稿")
    await userEvent.click(
      canvas.getByRole("button", { name: /查看 RIVA 参考补充|view RIVA reference supplement/i }),
    )
    const dialog = within(document.body).getByRole("alertdialog")
    await userEvent.click(
      within(dialog).getByRole("button", { name: /查看参考补充|view reference supplement/i }),
    )
    await expect(canvas.getByRole("alert")).not.toHaveTextContent(/private|stack/)
    await expect(canvas.getByRole("textbox")).toHaveValue("保留草稿")
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
      framework: false,
      hint: false,
      interactionLocked: true,
      referenceAnswer: false,
      submit: true,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/正在分析回答并准备下一步|reviewing your answer and preparing/i),
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
  args: createPracticeViewArgs("evaluatingAnswer"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-evaluating-state")).toBeVisible()
    await expect(canvas.getByTestId("practice-conversation-timeline")).toBeVisible()
  },
})
