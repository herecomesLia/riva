import preview from "#storybook/preview"
import { expect, userEvent, within } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import { createPracticeViewArgs, withReferenceAnswer } from "./practice-story-fixtures"
import { PracticeView } from "../PracticeView"

const meta = preview.meta({
  component: PracticeView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/Review",
})

export const Processing = meta.story({
  args: createPracticeViewArgs("processingAnswer"),
})

export const TaskFailureWithConversation = meta.story({
  args: { ...createPracticeViewArgs("processingAnswer"), taskError: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-task-failure")).toBeVisible()
    await expect(canvas.queryByText(/unsafe|stack|exception/i)).not.toBeInTheDocument()
  },
})

export const BalancedReview = meta.story({
  args: createPracticeViewArgs("reviewBalanced"),
})

export const ReviewWithPersonalizedExample = meta.story({
  args: withReferenceAnswer("reviewBalanced", "project", 1),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^查看复盘：|^View review:/i })[0])
    await expect(canvas.getByText(/我会选用推荐材料中的/)).toBeVisible()
  },
})

export const ReviewWithReactReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technical_basics", 1),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^查看复盘：|^View review:/i })[0])
    await expect(canvas.getByText(/React 重复渲染首先要区分/)).toBeVisible()
  },
})

export const ReviewWithRequestLayerReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technical_basics", 2),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^查看复盘：|^View review:/i })[0])
    await expect(canvas.getByText(/长期演进的数据请求层/)).toBeVisible()
    await expect(canvas.queryByText(/React 重复渲染首先要区分/)).not.toBeInTheDocument()
  },
})

export const LongReviewContent = meta.story({
  args: createPracticeViewArgs("reviewLongContent"),
})

export const MotivationReview = meta.story({
  args: createPracticeViewArgs("reviewMotivation"),
})

export const FollowUpEndedEarlyReview = meta.story({
  args: createPracticeViewArgs("reviewFollowUpEndedEarly"),
})

export const FollowUpReviewWithReferences = meta.story({
  args: createPracticeViewArgs("reviewBalanced"),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^查看复盘：|^View review:/i })[0])
    await expect(canvas.getByTestId("practice-follow-up-review")).toBeVisible()
    await expect(
      canvas.getAllByRole("heading", { name: /RIVA 参考答案|RIVA reference answer/i }),
    ).not.toHaveLength(0)
  },
})

export const FollowUpReviewWithUnansweredReference = meta.story({
  args: createPracticeViewArgs("reviewFollowUpEndedEarly"),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^查看复盘：|^View review:/i })[0])
    const review = canvas.getByTestId("practice-follow-up-review")
    await expect(within(review).getByText(/未回答|Unanswered/i)).toBeVisible()
  },
})

export const FollowUpEndedEarly = meta.story({
  args: createPracticeViewArgs("processingFollowUpEndedEarly"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-processing-state")).toBeVisible()
    await expect(canvas.getByTestId("practice-follow-up-incomplete")).toBeVisible()
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
  },
})

export const ProcessingMainAnswer = meta.story({
  args: createPracticeViewArgs("processingNoFollowUp"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-processing-state")).toBeVisible()
    await expect(canvas.queryByText(/追问 1|Follow-up 1/i)).not.toBeInTheDocument()
  },
})
