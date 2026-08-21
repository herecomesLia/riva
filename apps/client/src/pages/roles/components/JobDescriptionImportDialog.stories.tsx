import { useState } from "react"
import type { UserEvent } from "@testing-library/user-event"

import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import { createJobDescriptionImportDraftFixture } from "@/mocks/data/job-description-import"
import type { JobDescriptionImportDraft } from "@/services/job-description-import"

import { JobDescriptionImportDialog } from "./JobDescriptionImportDialog"

const meta = preview.meta({
  component: JobDescriptionImportDialog,
  title: "Roles/JobDescriptionImportDialog",
})

function DialogHarness({
  applyDraft = fn(() => new Promise<JobDescriptionImportDraft>(() => undefined)),
  createResult,
  getDraft = fn(() => new Promise<JobDescriptionImportDraft>(() => undefined)),
}: {
  applyDraft?: (draftId: string) => Promise<JobDescriptionImportDraft>
  createResult?: JobDescriptionImportDraft
  getDraft?: (draftId: string) => Promise<JobDescriptionImportDraft>
}) {
  const [open, setOpen] = useState(true)
  return (
    <JobDescriptionImportDialog
      applyDraft={applyDraft}
      createDraft={
        createResult
          ? fn(async () => createResult)
          : fn(() => new Promise<JobDescriptionImportDraft>(() => undefined))
      }
      getDraft={getDraft}
      onApplied={fn()}
      onOpenChange={setOpen}
      open={open}
      pollIntervalMs={0}
    />
  )
}

async function submitStoryJd(userEvent: UserEvent) {
  const dialog = await screen.findByRole("dialog")
  await userEvent.type(
    within(dialog).getByLabelText(/岗位 JD 原文|job description text/i),
    "Riva is hiring a Senior Frontend Engineer in Shanghai.",
  )
  await userEvent.click(
    within(dialog).getByRole("button", { name: /开始识别|start identification/i }),
  )
}

export const Input = meta.story({
  render: () => <DialogHarness />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    const input = within(dialog).getByLabelText(/岗位 JD 原文|job description text/i)
    await userEvent.type(input, "Riva is hiring a Senior Frontend Engineer in Shanghai.")
    await expect(input).toHaveValue("Riva is hiring a Senior Frontend Engineer in Shanghai.")
  },
})

export const Parsing = meta.story({
  render: () => <DialogHarness createResult={createJobDescriptionImportDraftFixture("parsing")} />,
  play: async ({ userEvent }) => {
    await submitStoryJd(userEvent)
    await expect(screen.findByText(/正在解析 JD|parsing the JD/i)).resolves.toBeVisible()
  },
})

export const Ready = meta.story({
  render: () => <DialogHarness createResult={createJobDescriptionImportDraftFixture("ready")} />,
  play: async ({ userEvent }) => {
    await submitStoryJd(userEvent)
    await expect(screen.findByText(/JD 解析完成|JD parsing complete/i)).resolves.toBeVisible()
    await expect(screen.findByText("高级前端工程师")).resolves.toBeVisible()
  },
})

export const Failed = meta.story({
  render: () => <DialogHarness createResult={createJobDescriptionImportDraftFixture("failed")} />,
  play: async ({ userEvent }) => {
    await submitStoryJd(userEvent)
    await expect(screen.findByText(/JD 解析失败|JD parsing failed/i)).resolves.toBeVisible()
  },
})

export const Applying = meta.story({
  render: () => <DialogHarness createResult={createJobDescriptionImportDraftFixture("ready")} />,
  play: async ({ userEvent }) => {
    await submitStoryJd(userEvent)
    await userEvent.click(
      await screen.findByRole("button", { name: /确认创建岗位|confirm and create role/i }),
    )
    await expect(screen.getByRole("button", { name: /正在创建岗位|creating role/i })).toBeDisabled()
  },
})
