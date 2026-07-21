import preview from "#storybook/preview"

import { createPracticeMockResponse } from "@/mocks/data/practice"

import { PracticeSessionHeader } from "./PracticeSessionHeader"

const response = createPracticeMockResponse("answeringQuestion")
if (response.session.status !== "answering") throw new Error("An answering fixture is required.")

const meta = preview.meta({
  component: PracticeSessionHeader,
  title: "Practice/Components/SessionHeader",
})

export const Default = meta.story({
  args: { context: response.setupContext, selection: response.session.selection },
})
