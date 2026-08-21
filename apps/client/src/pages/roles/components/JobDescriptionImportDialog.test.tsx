import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createJobDescriptionImportDraftFixture } from "@/mocks/data/job-description-import"
import type { JobDescriptionImportDraft } from "@/services/job-description-import"
import { renderWithProviders } from "@/test/render"

import { JobDescriptionImportDialog } from "./JobDescriptionImportDialog"

const appliedRoleId = "30000000-0000-4000-8000-000000000001"

function renderDialog(overrides: Partial<ComponentProps<typeof JobDescriptionImportDialog>> = {}) {
  return renderWithProviders(
    <JobDescriptionImportDialog
      applyDraft={vi.fn(() => new Promise<JobDescriptionImportDraft>(() => undefined))}
      createDraft={vi.fn(() => new Promise<JobDescriptionImportDraft>(() => undefined))}
      getDraft={vi.fn(() => new Promise<JobDescriptionImportDraft>(() => undefined))}
      onApplied={vi.fn()}
      onOpenChange={vi.fn()}
      open
      pollIntervalMs={0}
      {...overrides}
    />,
    { router: false },
  )
}

async function submitJobDescription(rawText: string) {
  const user = userEvent.setup()
  const dialog = await screen.findByRole("dialog")
  await user.type(within(dialog).getByLabelText(i18n.t("roles.import.input.label")), rawText)
  await user.click(
    within(dialog).getByRole("button", { name: i18n.t("roles.import.actions.start") }),
  )
  return { dialog, user }
}

describe("JobDescriptionImportDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("submits the entered JD text to create a draft", async () => {
    const createDraft = vi.fn(() => new Promise<never>(() => undefined))
    renderDialog({ createDraft })

    await submitJobDescription("  Build reliable payment APIs.  ")

    expect(createDraft).toHaveBeenCalledWith({ rawText: "Build reliable payment APIs." })
  })

  it("shows the parsing state after draft creation", async () => {
    const parsing = createJobDescriptionImportDraftFixture("parsing")
    renderDialog({ createDraft: vi.fn(async () => parsing) })

    await submitJobDescription(parsing.rawText)

    expect(await screen.findByText(i18n.t("roles.import.parsing.title"))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: i18n.t("roles.import.actions.apply") })).toBeNull()
  })

  it("polls and displays the parsed company, role, location, and JD summary", async () => {
    const parsing = createJobDescriptionImportDraftFixture("parsing")
    const ready = createJobDescriptionImportDraftFixture("ready")
    const getDraft = vi.fn(async () => ready)
    renderDialog({ createDraft: vi.fn(async () => parsing), getDraft })

    await submitJobDescription(parsing.rawText)

    const readyTitle = await screen.findByText(i18n.t("roles.import.ready.title"))
    const dialog = readyTitle.closest('[role="dialog"]')!
    expect(getDraft).toHaveBeenCalledWith(parsing.id)
    expect(dialog).toHaveTextContent(ready.parsedCompany!)
    expect(dialog).toHaveTextContent(ready.parsedTitle!)
    expect(dialog).toHaveTextContent(ready.parsedLocation!)
    expect(dialog).toHaveTextContent(ready.parsedDescription!)
  })

  it("hands the new role to page navigation after apply succeeds", async () => {
    const ready = createJobDescriptionImportDraftFixture("ready")
    const applied = {
      ...ready,
      appliedRoleId,
      canApply: false,
      status: "applied" as const,
    }
    const applyDraft = vi.fn(async () => applied)
    const onApplied = vi.fn(async () => undefined)
    const onOpenChange = vi.fn()
    renderDialog({
      applyDraft,
      createDraft: vi.fn(async () => ready),
      onApplied,
      onOpenChange,
    })
    const { user } = await submitJobDescription(ready.rawText)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.import.actions.apply") }),
    )

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(appliedRoleId))
    expect(applyDraft).toHaveBeenCalledWith(ready.id)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("preserves the JD after parsing fails and allows it to be submitted again", async () => {
    const parsing = createJobDescriptionImportDraftFixture("parsing")
    const failed = createJobDescriptionImportDraftFixture("failed")
    const ready = createJobDescriptionImportDraftFixture("ready")
    const createDraft = vi.fn(async () => ready).mockResolvedValueOnce(parsing)
    renderDialog({
      createDraft,
      getDraft: vi.fn(async () => failed),
    })
    const { user } = await submitJobDescription(parsing.rawText)

    expect(await screen.findByText(failed.failureReason!)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: i18n.t("roles.import.actions.reenter") }))
    expect(screen.getByLabelText(i18n.t("roles.import.input.label"))).toHaveValue(parsing.rawText)
    await user.click(screen.getByRole("button", { name: i18n.t("roles.import.actions.start") }))

    expect(await screen.findByText(i18n.t("roles.import.ready.title"))).toBeInTheDocument()
    expect(createDraft).toHaveBeenCalledTimes(2)
    expect(createDraft).toHaveBeenLastCalledWith({ rawText: parsing.rawText })
  })

  it("keeps the ready draft after apply fails and allows confirmation to be retried", async () => {
    const ready = createJobDescriptionImportDraftFixture("ready")
    const applied = {
      ...ready,
      appliedRoleId,
      canApply: false,
      status: "applied" as const,
    }
    const applyDraft = vi
      .fn(async () => applied)
      .mockRejectedValueOnce(new Error("apply unavailable"))
    const onApplied = vi.fn(async () => undefined)
    const onOpenChange = vi.fn()
    renderDialog({
      applyDraft,
      createDraft: vi.fn(async () => ready),
      onApplied,
      onOpenChange,
    })
    const { user } = await submitJobDescription(ready.rawText)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.import.actions.apply") }),
    )

    expect(await screen.findByText(i18n.t("roles.import.applyFailed.title"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("roles.import.ready.title"))).toBeInTheDocument()
    expect(screen.getByText(ready.parsedTitle!)).toBeInTheDocument()
    const retryButton = screen.getByRole("button", {
      name: i18n.t("roles.import.actions.apply"),
    })
    expect(retryButton).toBeEnabled()

    await user.click(retryButton)

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(appliedRoleId))
    expect(applyDraft).toHaveBeenCalledTimes(2)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
