import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import type { RecognizeTargetRoleInput } from "@/models/roles"

import { TargetRoleCreationDialog } from "./TargetRoleCreationDialog"

const meta = preview.meta({
  component: TargetRoleCreationDialog,
  title: "Roles/TargetRoleCreationDialog",
})

function recognize(input: RecognizeTargetRoleInput) {
  const rawText =
    input.sourceType === "text"
      ? input.text
      : "Frontend Engineer\nCompany: Riva\nLocation: Shanghai\n3-5 years of experience"
  return Promise.resolve({
    recognitionId: `recognition_${input.sourceType}`,
    sourceType: input.sourceType,
    sourceLabel:
      input.sourceType === "text"
        ? "Pasted job posting"
        : input.sourceType === "image"
          ? input.images.map((image) => image.name).join(", ")
          : input.url,
    rawText,
    suggestedRole: {
      title: "Frontend Engineer",
      company: "Riva",
      recruitmentType: "experienced" as const,
      location: "Shanghai",
    },
  })
}

function DialogHarness() {
  const [open, setOpen] = useState(true)
  return (
    <TargetRoleCreationDialog
      onCreateFromRecognition={async () => setOpen(false)}
      onDirtyChange={() => undefined}
      onManualCreate={async () => setOpen(false)}
      onOpenChange={setOpen}
      onRecognize={recognize}
      onSaved={() => setOpen(false)}
      open={open}
    />
  )
}

export const MethodSelection = meta.story({ render: () => <DialogHarness /> })

export const Manual = meta.story({
  render: () => <DialogHarness />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /手动填写|enter manually/i }))
    await expect(
      screen.findByRole("dialog", { name: /手动填写目标岗位|enter target role manually/i }),
    ).resolves.toBeVisible()
  },
})

export const PasteAndReview = meta.story({
  render: () => <DialogHarness />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /粘贴文字|paste text/i }))
    const entryDialog = await screen.findByRole("dialog", {
      name: /粘贴岗位文字|paste job posting text/i,
    })
    await userEvent.type(
      within(entryDialog).getByLabelText(/岗位信息原文|job posting text/i),
      "Frontend Engineer\nCompany: Riva",
    )
    await userEvent.click(
      within(entryDialog).getByRole("button", { name: /让 Riva 识别|recognize with riva/i }),
    )
    await expect(
      within(entryDialog).findByTestId("target-role-recognition-review"),
    ).resolves.toBeVisible()
  },
})

export const ImageAgent = meta.story({
  args: {
    onCreateFromRecognition: fn(async () => undefined),
    onDirtyChange: fn(),
    onManualCreate: fn(async () => undefined),
    onOpenChange: fn(),
    onRecognize: fn(recognize),
    onSaved: fn(),
    open: true,
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /上传图片|upload images/i }))
    const entryDialog = await screen.findByRole("dialog", {
      name: /上传岗位图片|upload job posting images/i,
    })
    await expect(within(entryDialog).findByText(/视觉 Agent|vision agent/i)).resolves.toBeVisible()
  },
})

export const JobLink = meta.story({
  render: () => <DialogHarness />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /岗位链接|job link/i }))
    const entryDialog = await screen.findByRole("dialog", {
      name: /添加岗位链接|add a job posting link/i,
    })
    await userEvent.type(
      within(entryDialog).getByLabelText(/岗位网页链接|job posting url/i),
      "https://jobs.example.com/frontend-engineer",
    )
    await userEvent.click(
      within(entryDialog).getByRole("button", { name: /让 Riva 识别|recognize with riva/i }),
    )
    await expect(
      within(entryDialog).findByTestId("target-role-recognition-review"),
    ).resolves.toBeVisible()
  },
})
