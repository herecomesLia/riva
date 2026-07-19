import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import type { TargetRole } from "@/models/roles"

import {
  createLongJobDescriptionResponse,
  createParsingJobDescriptionResponse,
  createReadyJobDescriptionResponse,
  createRoleStoryResponse,
} from "../stories/role-story-fixtures"
import { JobDescriptionCard } from "./JobDescriptionCard"
import { JobDescriptionEditorDialog } from "./JobDescriptionEditorDialog"

const meta = preview.meta({
  component: JobDescriptionCard,
  title: "Roles/JobDescriptionCard",
})

function roleFor(scenario: Parameters<typeof createRoleStoryResponse>[0]) {
  return createRoleStoryResponse(scenario).roles[0]!
}

export const Missing = meta.story({
  args: { role: roleFor("singleRoleWithoutJobDescription"), synchronizationError: false },
})

export const Parsing = meta.story({
  args: { role: roleFor("roleWithJobDescriptionParsing"), synchronizationError: false },
})

export const SynchronizationError = meta.story({
  args: {
    onRetrySynchronization: fn(),
    role: roleFor("roleWithJobDescriptionParsing"),
    synchronizationError: true,
  },
})

function SynchronizationRetryHarness() {
  const parsing = createRoleStoryResponse("roleWithJobDescriptionParsing")
  const ready = createReadyJobDescriptionResponse(
    parsing,
    "Deliver reliable frontend architecture for complex merchant workflows.",
  )
  const [role, setRole] = useState<TargetRole>(parsing.roles[0]!)
  const [synchronizationError, setSynchronizationError] = useState(true)
  return (
    <JobDescriptionCard
      onRetrySynchronization={() => {
        setSynchronizationError(false)
        setRole(ready.roles[0]!)
      }}
      role={role}
      synchronizationError={synchronizationError}
    />
  )
}

export const SynchronizationRetry = meta.story({
  render: () => <SynchronizationRetryHarness />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /重新同步状态|synchronize status/i }))
    await expect(screen.getByTestId("job-description-analysis")).toBeVisible()
  },
})

export const Failed = meta.story({
  args: {
    onEdit: fn(),
    onRetry: fn(),
    role: roleFor("roleWithJobDescriptionFailed"),
    synchronizationError: false,
  },
})

export const Ready = meta.story({
  args: {
    onEdit: fn(),
    role: roleFor("roleWithParsedJobDescription"),
    synchronizationError: false,
  },
})

export const EditSummary = meta.story({
  args: {
    onEdit: fn(),
    onEditAnalysisModule: fn(),
    role: roleFor("roleWithParsedJobDescription"),
    synchronizationError: false,
  },
  play: async ({ userEvent }) => {
    await userEvent.click(
      screen.getByRole("button", { name: /编辑 核心要求总结|edit core requirements/i }),
    )
  },
})

export const LongJobDescription = meta.story({
  args: {
    onEdit: fn(),
    role: createLongJobDescriptionResponse().roles[0]!,
    synchronizationError: false,
  },
})

function EditorHarness({ initialRole }: { initialRole: TargetRole }) {
  const [role, setRole] = useState(initialRole)
  const [open, setOpen] = useState(false)
  const parsing = createParsingJobDescriptionResponse(
    {
      currentRoleId: role.id,
      profileContext: createRoleStoryResponse("matchingAnalysisCurrent").profileContext,
      roles: [role],
    },
    "Own reliable platform delivery and cross-team technical direction.",
  )
  const ready = createReadyJobDescriptionResponse(
    parsing,
    "Own reliable platform delivery and cross-team technical direction.",
  )

  return (
    <>
      <JobDescriptionCard onEdit={() => setOpen(true)} role={role} synchronizationError={false} />
      <JobDescriptionEditorDialog
        onDirtyChange={() => undefined}
        onOpenChange={setOpen}
        onSave={async () => {
          setRole(ready.roles[0]!)
        }}
        onSaved={() => setOpen(false)}
        open={open}
        role={role}
      />
    </>
  )
}

export const ReplaceJobDescription = meta.story({
  render: () => <EditorHarness initialRole={roleFor("matchingAnalysisCurrent")} />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /替换 JD|replace JD/i }))
    const dialog = await screen.findByRole("dialog")
    const input = within(dialog).getByLabelText(/JD 原文|JD text/i)
    await userEvent.clear(input)
    await userEvent.type(
      input,
      "Own reliable platform delivery and cross-team technical direction.",
    )
    await userEvent.click(
      within(dialog).getByRole("button", { name: /保存并解析|save and parse/i }),
    )
    await expect(
      screen.findByText("Own reliable platform delivery and cross-team technical direction."),
    ).resolves.toBeVisible()
  },
})

function RetryHarness() {
  const failed = createRoleStoryResponse("roleWithJobDescriptionFailed")
  const parsing = createParsingJobDescriptionResponse(
    failed,
    failed.roles[0]!.jobDescription.rawText ?? "Retry this job description.",
  )
  const ready = createReadyJobDescriptionResponse(
    parsing,
    "Build reliable creator-facing web products with measurable performance.",
  )
  const [role, setRole] = useState<TargetRole>(failed.roles[0]!)
  return (
    <JobDescriptionCard
      onRetry={() => setRole(ready.roles[0]!)}
      role={role}
      synchronizationError={false}
    />
  )
}

export const RetryParsing = meta.story({
  render: () => <RetryHarness />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /重试解析|retry parsing/i }))
    await expect(screen.getByTestId("job-description-analysis")).toBeVisible()
  },
})
