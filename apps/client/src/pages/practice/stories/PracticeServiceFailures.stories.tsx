import preview from "#storybook/preview"
import { useState } from "react"
import { expect, userEvent } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import type { PracticeMockScenario } from "@/mocks/data/practice"
import {
  resetPracticeMockState,
  type PracticeMockControllerOptions,
} from "@/mocks/services/practice"
import { resetRolesMockState } from "@/mocks/services/roles"

import { PracticePage } from "../PracticePage"

type PracticeServiceFailureStoryProps = {
  controller: PracticeMockControllerOptions
  scenario: PracticeMockScenario
}

function PracticeServiceFailureStory({ controller, scenario }: PracticeServiceFailureStoryProps) {
  const [initialized] = useState(() => {
    resetRolesMockState("multipleRoles")
    resetPracticeMockState(scenario, controller)
    return true
  })

  return initialized ? <PracticePage /> : null
}

const meta = preview.meta({
  component: PracticeServiceFailureStory,
  decorators: [withRouter],
  parameters: {
    controls: { disable: true },
    router: { initialEntries: ["/practice"] },
  },
  title: "Pages/Practice/Service failures",
})

export const PageLoadFailureRetry = meta.story({
  args: {
    controller: { defaultDelayMs: 0, failNext: ["getPracticePage"] },
    scenario: "setupReady",
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      /页面状态异常|page status error/i,
    )
    await expect(canvas.queryByText(/Practice mock operation failed/)).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole("button", { name: /重新加载|reload/i }))
    await expect(
      await canvas.findByRole("heading", { name: /练习设置|practice setup/i }),
    ).toBeVisible()
  },
})

export const StartFailureRetry = meta.story({
  args: {
    controller: { defaultDelayMs: 0, failNext: ["startPracticeSession"] },
    scenario: "setupReady",
  },
  play: async ({ canvas }) => {
    const start = await canvas.findByRole("button", {
      name: /开始练习|start practice/i,
    })
    await userEvent.click(start)
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      /暂时无法开始练习|unable to start practice/i,
    )
    await expect(canvas.queryByText(/Practice mock operation failed/)).not.toBeInTheDocument()

    await userEvent.click(start)
    await expect(await canvas.findByTestId("practice-generating-state")).toBeVisible()
  },
})

export const GenerationPollingFailureRetry = meta.story({
  args: {
    controller: {
      defaultDelayMs: 0,
      failNext: ["getQuestionGenerationStatus"],
    },
    scenario: "generatingQuestion",
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      /题目生成未完成|question generation/i,
    )
    await expect(canvas.queryByText(/Practice mock operation failed/)).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole("button", { name: /重新生成|generate again/i }))
    await expect(await canvas.findByTestId("practice-answering-state")).toBeVisible()
  },
})
