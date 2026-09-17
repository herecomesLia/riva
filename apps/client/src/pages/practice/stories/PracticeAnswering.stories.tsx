import preview from "#storybook/preview"
import { expect, screen, userEvent, within } from "storybook/test"
import { useRouter } from "@tanstack/react-router"

import { withRouter } from "#storybook/decorators/with-router"
import { createPracticeViewArgs, withReferenceAnswer } from "./practice-story-fixtures"
import { PracticeView } from "../PracticeView"

const meta = preview.meta({
  component: PracticeView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/Answering",
})

export const AnsweringDefault = meta.story({
  args: createPracticeViewArgs("answeringQuestion"),
  play: async ({ canvas }) => {
    const actionBar = canvas.getByTestId("practice-question-actions-bar")
    await expect(actionBar).toHaveClass("fixed", "bottom-0", "z-40")
    await expect(
      canvas
        .getByRole("button", { name: /查看参考答案|view reference answer/i })
        .querySelector(".lucide-sparkles"),
    ).toBeVisible()
  },
})

export const AnsweringActionsLocked = meta.story({
  args: {
    ...createPracticeViewArgs("answeringQuestion"),
    answeringPending: {
      ...createPracticeViewArgs("answeringQuestion").answeringPending,
      saved: true,
      interactionLocked: true,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /查看提示|view hints/i })).toBeEnabled()
    await expect(
      canvas.getByRole("button", { name: /查看答题框架|view answer framework/i }),
    ).toBeEnabled()
    await expect(canvas.getByRole("button", { name: /收藏题目|save question/i })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: /标记为薄弱题|mark as weak/i })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: /跳过本题|skip question/i })).toBeDisabled()
    await expect(canvas.getByRole("textbox")).toBeEnabled()
  },
})

export const AnsweringMobileFixedActions = meta.story({
  args: createPracticeViewArgs("answeringQuestion"),
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  play: async ({ canvas }) => {
    const actionBar = canvas.getByTestId("practice-question-actions-bar")
    await expect(actionBar).toBeVisible()
    for (const name of [
      /收藏题目|save question/i,
      /标记为薄弱题|mark as weak/i,
      /跳过本题|skip question/i,
    ]) {
      await expect(within(actionBar).getByRole("button", { name })).toBeVisible()
    }
  },
})

export const AnsweringReferenceAnswerHidden = meta.story({
  args: createPracticeViewArgs("answeringQuestion"),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /查看参考答案|view reference answer/i }),
    ).toBeVisible()
    await expect(canvas.queryByText(/我会选用推荐材料|I would use/i)).not.toBeInTheDocument()
  },
})

export const AnsweringReferenceAnswerRevealed = meta.story({
  args: withReferenceAnswer("answeringQuestion", "project", 1),
  play: async ({ canvas }) => {
    await expandReference(canvas)
    await expect(canvas.getByText(/我会选用推荐材料中的/)).toBeVisible()
  },
})

function longAnsweringArgs() {
  const args = withReferenceAnswer("answeringQuestion", "project", 1)
  const response = structuredClone(args.content.data)
  if (response.session.status !== "answering") throw new Error("Answering fixture required.")
  response.session.question.prompt = `${response.session.question.prompt} ${response.session.question.prompt}`
  response.session.question.referenceAnswer = Array(8)
    .fill(response.session.question.referenceAnswer)
    .join("\n\n")
  return { ...args, content: { data: response, status: "ready" as const } }
}

export const AnsweringLongContentWithFixedActions = meta.story({
  args: longAnsweringArgs(),
  play: async ({ canvas }) => {
    await expandReference(canvas)
    await expect(canvas.getByTestId("practice-reference-answer")).toBeVisible()
    await expect(canvas.getByTestId("practice-question-actions-bar")).toBeVisible()
    await expect(canvas.getByTestId("practice-answering-state")).toHaveClass(
      "pb-56",
      "min-[360px]:pb-40",
      "sm:pb-28",
    )
  },
})

export const AnsweringReactReference = meta.story({
  args: withReferenceAnswer("answeringQuestion", "technical_basics", 1),
  play: async ({ canvas }) => {
    await expandReference(canvas)
    await expect(canvas.getByText(/React 重复渲染首先要区分/)).toBeVisible()
  },
})

export const AnsweringRequestLayerReference = meta.story({
  args: withReferenceAnswer("answeringQuestion", "technical_basics", 2),
  play: async ({ canvas }) => {
    await expandReference(canvas)
    await expect(canvas.getByText(/长期演进的数据请求层/)).toBeVisible()
    await expect(canvas.queryByText(/React 重复渲染首先要区分/)).not.toBeInTheDocument()
  },
})

function DraftLeaveProtectionStory() {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4">
      <PracticeView {...createPracticeViewArgs("answeringQuestion")} />
      <button onClick={() => void router.navigate({ to: "/profile" })} type="button">
        Leave practice
      </button>
    </div>
  )
}

export const DraftLeaveProtection = meta.story({
  render: () => <DraftLeaveProtectionStory />,
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox"), "未提交的专项练习草稿")
    await userEvent.click(canvas.getByRole("button", { name: "Leave practice" }))
    const dialog = await screen.findByRole("alertdialog")
    await expect(
      within(dialog).getByRole("heading", { name: /离开并放弃回答|leave and discard/i }),
    ).toBeInTheDocument()
  },
})

async function expandReference(canvas: ReturnType<typeof within>) {
  await userEvent.click(canvas.getByRole("button", { name: /查看参考答案|view reference answer/i }))
  await userEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: /查看参考答案|view reference answer/i,
    }),
  )
}
