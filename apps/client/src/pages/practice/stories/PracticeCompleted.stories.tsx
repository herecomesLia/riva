import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import { createPracticeViewArgs } from "./practice-story-fixtures"
import { PracticeView } from "../PracticeView"

const meta = preview.meta({
  component: PracticeView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/Completed",
})

export const CompletedSession = meta.story({
  args: createPracticeViewArgs("completedSession"),
  play: async ({ canvas }) => {
    const completed = canvas.getByTestId("practice-completed-state")
    await expect(completed).toBeVisible()
    await expect(completed).toHaveTextContent(/完成题数：1|Questions completed: 1/i)
    await expect(completed).not.toHaveTextContent(/重练次数|Retries:/i)
    await expect(completed).toHaveTextContent(/标记薄弱题数：0|Marked weak questions: 0/i)
    await expect(completed).toHaveTextContent(
      /最终作答平均分：85 分|Final-attempt average score: 85 points/i,
    )
    await expect(canvas.getByRole("button", { name: /开始下一轮|start next round/i })).toBeEnabled()
    const historyButton = canvas.getByRole("button", {
      name: /查看练习记录|view practice history/i,
    })
    await expect(historyButton).toBeEnabled()
    await expect(historyButton).toHaveAttribute("href", "/history")
  },
})

export const CompletedStartingNextRound = meta.story({
  args: {
    ...createPracticeViewArgs("completedSession"),
    completedPending: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /正在准备下一轮|preparing next round/i }),
    ).toBeDisabled()
    await expect(
      canvas.getByTestId("practice-completed-state").querySelector('[data-slot="spinner"]'),
    ).toBeVisible()
    await expect(
      canvas.getByRole("button", { name: /查看练习记录|view practice history/i }),
    ).toHaveAttribute("aria-disabled", "true")
  },
})

const rejectedNextRound = fn(async () => {
  throw new Error("internal next-round error")
})

export const CompletedNextRoundError = meta.story({
  args: {
    ...createPracticeViewArgs("completedSession"),
    completedActions: { onPrepareNextRound: rejectedNextRound },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /开始下一轮|start next round/i }))
    await expect(rejectedNextRound).toHaveBeenCalledTimes(1)
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.queryByText(/internal next-round error/i)).not.toBeInTheDocument()
    await expect(canvas.getByTestId("practice-completed-state")).toBeVisible()
  },
})

export const CompletedWithWeakQuestions = meta.story({
  args: createPracticeViewArgs("completedWithWeakQuestions"),
  play: async ({ canvas }) => {
    const completed = canvas.getByTestId("practice-completed-state")
    await expect(completed).toHaveTextContent(/完成题数：1|Questions completed: 1/i)
    await expect(completed).toHaveTextContent(/标记薄弱题数：1|Marked weak questions: 1/i)
  },
})
