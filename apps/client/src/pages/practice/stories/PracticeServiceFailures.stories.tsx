import preview from "#storybook/preview"
import { useRef, useState } from "react"
import { expect, userEvent } from "storybook/test"
import { withRouter } from "#storybook/decorators/with-router"
import { PracticeView } from "../PracticeView"
import { createPracticeViewArgs } from "./practice-story-fixtures"

type Failure = "load" | "start" | "generation" | "evaluation" | "action"

function PracticeServiceFailureStory({ failure }: { failure: Failure }) {
  const [recovered, setRecovered] = useState(false)
  const attempted = useRef(false)
  const recover = () => setRecovered(true)
  if (failure === "load" && !recovered) {
    return <PracticeView variant="error" isRetrying={false} onRetry={recover} />
  }
  const args = createPracticeViewArgs(
    failure === "evaluation"
      ? recovered
        ? "reviewBalanced"
        : "evaluatingAnswer"
      : failure === "generation"
        ? recovered
          ? "answeringQuestion"
          : "generatingQuestion"
        : failure === "action"
          ? "answeringQuestion"
          : failure === "start" && recovered
            ? "generatingQuestion"
            : "setupReady",
  )
  return (
    <PracticeView
      {...args}
      generationError={failure === "generation" && !recovered}
      evaluationError={failure === "evaluation" && !recovered}
      onRetryGeneration={recover}
      onRetryEvaluation={recover}
      onStart={async () => {
        if (!attempted.current) {
          attempted.current = true
          throw new Error("Private request detail")
        }
        recover()
      }}
      answeringActions={{
        ...args.answeringActions,
        onRequestHint: async () => {
          throw new Error("Private request detail")
        },
      }}
    />
  )
}

const meta = preview.meta({
  component: PracticeServiceFailureStory,
  decorators: [withRouter],
  parameters: { controls: { disable: true }, router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/Service failures",
})

export const PageLoadFailureRetry = meta.story({
  args: { failure: "load" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /重新加载|reload/i }))
    await expect(await canvas.findByTestId("practice-setup-state")).toBeVisible()
  },
})

export const StartFailureRetry = meta.story({
  args: { failure: "start" },
  play: async ({ canvas }) => {
    const start = canvas.getByRole("button", { name: /开始练习|start practice/i })
    await userEvent.click(start)
    await expect(await canvas.findByRole("alert")).toBeVisible()
    await userEvent.click(start)
    await expect(await canvas.findByTestId("practice-generating-state")).toBeVisible()
  },
})

export const GenerationPollingFailureRetry = meta.story({
  args: { failure: "generation" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /重新生成|generate again/i }))
    await expect(await canvas.findByTestId("practice-answering-state")).toBeVisible()
  },
})

export const EvaluationFailureRetry = meta.story({
  args: { failure: "evaluation" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByTestId("practice-evaluation-error")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /重新评分|retry evaluation/i }))
    await expect(await canvas.findByTestId("practice-review-state")).toBeVisible()
  },
})

export const ActionFailure = meta.story({
  args: { failure: "action" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /请求提示|request hint/i }))
    await expect(await canvas.findByRole("alert")).toBeVisible()
  },
})
