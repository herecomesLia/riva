import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createResumeDraftStoryFixture } from "@/pages/profile/profile-resume-draft-story-fixtures"
import { renderWithProviders } from "@/test/render"

import { ProfileResumeDraftReviewState } from "./ProfileResumeDraftReviewState"

function renderDraft(
  scenario: Parameters<typeof createResumeDraftStoryFixture>[0] = "firstImport",
  overrides: Partial<ComponentProps<typeof ProfileResumeDraftReviewState>> = {},
) {
  const props = {
    applyConflict: null,
    applyError: false,
    draft: createResumeDraftStoryFixture(scenario),
    isApplying: false,
    onApply: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  return {
    props,
    ...renderWithProviders(<ProfileResumeDraftReviewState {...props} />, { router: false }),
  }
}

describe("ProfileResumeDraftReviewState", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("identifies an initial import without exposing profile metadata", () => {
    const draft = createResumeDraftStoryFixture("firstImport")
    renderDraft("firstImport")

    expect(screen.getByText(i18n.t("profile.importDraft.firstImport"))).toBeInTheDocument()
    expect(screen.queryByText(draft.resumeDocumentId)).not.toBeInTheDocument()
    expect(screen.queryByText(String(draft.draftVersion), { exact: true })).not.toBeInTheDocument()
  })

  it("identifies an update to an existing profile", () => {
    renderDraft("existingProfile")
    expect(screen.getByText(i18n.t("profile.importDraft.updateExisting"))).toBeInTheDocument()
  })

  it("shows the missing-items preservation warning only when needed", () => {
    const { rerender } = renderDraft("existingProfile")
    expect(screen.getAllByText(i18n.t("profile.importDraft.missingItemsDescription"))).toHaveLength(
      2,
    )

    const draft = createResumeDraftStoryFixture("firstImport")
    rerender(
      <ProfileResumeDraftReviewState
        applyConflict={null}
        applyError={false}
        draft={draft}
        isApplying={false}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getAllByText(i18n.t("profile.importDraft.missingItemsDescription"))).toHaveLength(
      1,
    )
  })

  it("keeps education, work, projects, and skills visible without a summary", () => {
    renderDraft("firstImport")

    expect(screen.getByTestId("resume-draft-education")).toBeInTheDocument()
    expect(screen.getByTestId("resume-draft-work")).toBeInTheDocument()
    expect(screen.getByTestId("resume-draft-projects")).toBeInTheDocument()
    expect(screen.getByTestId("resume-draft-skills")).toBeInTheDocument()
  })

  it("renders project details and a safe external link", () => {
    const draft = createResumeDraftStoryFixture("firstImport")
    renderDraft("firstImport")
    const project = screen.getByTestId("resume-draft-projects")
    const link = within(project).getByRole("link", {
      name: i18n.t("profile.importDraft.projectLink"),
    })

    expect(project).toHaveTextContent(draft.projectExperiences[0]!.role!)
    expect(link).toHaveAttribute("href", draft.projectExperiences[0]!.projectUrl)
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noreferrer")
  })

  it("marks matching protected education, work, and project candidates", () => {
    renderDraft("protected")

    expect(
      within(screen.getByTestId("resume-draft-education")).getByText(
        i18n.t("profile.importDraft.manualProtected"),
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId("resume-draft-work")).getByText(
        i18n.t("profile.importDraft.manualProtected"),
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId("resume-draft-projects")).getByText(
        i18n.t("profile.importDraft.manualProtected"),
      ),
    ).toBeInTheDocument()
  })

  it("aggregates protected items by section and source without showing item IDs", () => {
    const draft = createResumeDraftStoryFixture("protected")
    renderDraft("protected")
    const section = screen.getByTestId("resume-draft-protected-items")

    expect(section).toHaveTextContent(i18n.t("profile.sections.education"))
    expect(section).toHaveTextContent(
      i18n.t("profile.importDraft.protectedUserEdited", { count: 1 }),
    )
    expect(section).toHaveTextContent(
      i18n.t("profile.importDraft.protectedUserAdded", { count: 1 }),
    )
    for (const item of draft.protectedItems) expect(section).not.toHaveTextContent(item.itemId)
  })

  it("renders unresolved content as plain text", () => {
    renderDraft("skippedAndUnresolved")
    const section = screen.getByTestId("resume-draft-unresolved-items")

    expect(section).toHaveTextContent("<strong>unverified leadership scope</strong>")
  })

  it("hides attention sections when their collections are empty", () => {
    renderDraft("firstImport")
    expect(screen.queryByTestId("resume-draft-protected-items")).not.toBeInTheDocument()
    expect(screen.queryByTestId("resume-draft-skipped-items")).not.toBeInTheDocument()
    expect(screen.queryByTestId("resume-draft-unresolved-items")).not.toBeInTheDocument()
  })

  it("renders superseded and failed apply states separately", () => {
    renderDraft("existingProfile", {
      applyConflict: "resume_import_draft_version_conflict",
      applyError: true,
    })

    expect(screen.getByTestId("profile-resume-draft-conflict")).toHaveTextContent(
      i18n.t("profile.importDraft.conflictDescription"),
    )
    expect(screen.getByTestId("profile-resume-draft-apply-error")).toHaveTextContent(
      i18n.t("profile.importDraft.applyFailedDescription"),
    )
  })

  it("keeps details visible and disables both actions while applying", () => {
    renderDraft("firstImport", { isApplying: true })
    const review = screen.getByTestId("profile-resume-draft-review")

    expect(review).toHaveAttribute("aria-busy", "true")
    expect(screen.getByTestId("resume-draft-work")).toBeVisible()
    expect(
      screen.getByRole("button", { name: i18n.t("profile.importDraft.cancel") }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("profile.importDraft.applying") }),
    ).toBeDisabled()
  })

  it("delegates cancel and apply independently", async () => {
    const user = userEvent.setup()
    const { props } = renderDraft()

    await user.click(screen.getByRole("button", { name: i18n.t("profile.importDraft.cancel") }))
    await user.click(screen.getByRole("button", { name: i18n.t("profile.importDraft.apply") }))
    expect(props.onCancel).toHaveBeenCalledOnce()
    expect(props.onApply).toHaveBeenCalledOnce()
  })
})
