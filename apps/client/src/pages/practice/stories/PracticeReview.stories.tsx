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

export const BalancedReview = meta.story({
  args: createPracticeViewArgs("reviewBalanced"),
})

export const ReviewWithPersonalizedExample = meta.story({
  args: withReferenceAnswer("reviewBalanced", "projectDeepDive", 1, false),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /展开参考答案|expand reference/i }))
    await expect(canvas.getByText(/我会选用推荐材料中的/)).toBeVisible()
  },
})

export const ReviewWithTechnicalReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technicalFoundation", 1, false),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/技术参考答案|technical reference answer/i)).toBeVisible()
  },
})

export const ReviewWithReactReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technicalFoundation", 1, false),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /展开参考答案|expand reference/i }))
    await expect(canvas.getByText(/React 重复渲染首先要区分/)).toBeVisible()
  },
})

export const ReviewWithRequestLayerReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technicalFoundation", 2, false),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /展开参考答案|expand reference/i }))
    await expect(canvas.getByText(/长期演进的数据请求层/)).toBeVisible()
    await expect(canvas.queryByText(/React 重复渲染首先要区分/)).not.toBeInTheDocument()
  },
})

export const ReviewAssistedAttempt = meta.story({
  args: withReferenceAnswer("reviewBalanced", "projectDeepDive", 1, true),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/作答前已查看|viewed before submission/i)).toBeVisible()
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
    await expect(canvas.getByTestId("practice-follow-up-review")).toBeVisible()
    await expect(
      canvas.getAllByRole("button", { name: /展开 RIVA|expand RIVA/i }),
    ).not.toHaveLength(0)
  },
})

export const FollowUpReviewWithUnansweredReference = meta.story({
  args: createPracticeViewArgs("reviewFollowUpEndedEarly"),
  play: async ({ canvas, userEvent }) => {
    const review = canvas.getByTestId("practice-follow-up-review")
    const buttons = within(review).getAllByRole("button", { name: /展开 RIVA|expand RIVA/i })
    await userEvent.click(buttons.at(-1)!)
    await expect(within(review).getByText(/未回答|Unanswered/i)).toBeVisible()
  },
})

export const FollowUpEndedEarly = meta.story({
  args: createPracticeViewArgs("reviewFollowUpEndedEarly"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-review-state")).toBeVisible()
    await expect(canvas.getByTestId("practice-follow-up-incomplete")).toBeVisible()
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
  },
})

export const NoFollowUpRequired = meta.story({
  args: createPracticeViewArgs("reviewNoFollowUp"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-review-state")).toBeVisible()
    await expect(canvas.queryByText(/追问 1|Follow-up 1/i)).not.toBeInTheDocument()
  },
})
