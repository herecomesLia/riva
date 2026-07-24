import preview from "#storybook/preview"
import { CheckCircle2Icon } from "lucide-react"
import { expect } from "storybook/test"

import { InterviewReviewListCard } from "./InterviewReviewListCard"

const items = ["能清楚区分个人贡献与团队结果", "能够使用数据说明方案效果"]

const meta = preview.meta({
  component: InterviewReviewListCard,
  title: "Interview/InterviewReviewListCard",
})

export const Default = meta.story({
  args: {
    icon: <CheckCircle2Icon aria-hidden="true" />,
    items,
    title: "主要优势",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(items[0]!)).toBeVisible()
  },
})

export const Empty = meta.story({
  args: {
    icon: <CheckCircle2Icon aria-hidden="true" />,
    items: [],
    title: "主要优势",
  },
})
