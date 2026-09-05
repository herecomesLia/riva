import preview from "#storybook/preview"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"

import { PracticeSessionHeader } from "./PracticeSessionHeader"

const response = createPracticeScenario("answeringQuestion")
if (response.session.status !== "answering") throw new Error("An answering fixture is required.")

const meta = preview.meta({
  component: PracticeSessionHeader,
  title: "Practice/PracticeSessionHeader",
})

export const Default = meta.story({
  args: { context: response.setupContext, selection: response.session.selection },
})
