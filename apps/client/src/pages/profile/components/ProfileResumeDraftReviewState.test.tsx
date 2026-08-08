import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import type { ResumeImportSkipReason } from "@/models/profile"
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
    expect(screen.queryByText(draft.sourceRunId)).not.toBeInTheDocument()
    expect(screen.queryByText(String(draft.draftVersion), { exact: true })).not.toBeInTheDocument()
  })

  it("identifies an update to an existing profile", () => {
    renderDraft("existingProfile")
    expect(screen.getByText(i18n.t("profile.importDraft.updateExisting"))).toBeInTheDocument()
  })

  it("renders all change metrics with descriptions", () => {
    renderDraft("existingProfile")
    const overview = screen.getByTestId("resume-draft-overview")

    expect(overview).toHaveTextContent(i18n.t("profile.importDraft.newItemsDescription"))
    expect(overview).toHaveTextContent(i18n.t("profile.importDraft.changedItemsDescription"))
    expect(overview).toHaveTextContent(i18n.t("profile.importDraft.missingItemsDescription"))
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

  it("renders a summary that will be set", () => {
    const draft = createResumeDraftStoryFixture("explicitSummary")
    renderDraft("explicitSummary")
    const section = screen.getByTestId("resume-draft-summary")

    expect(section).toHaveTextContent(i18n.t("profile.importDraft.summarySet"))
    expect(section).toHaveTextContent(draft.summary!)
  })

  it("renders a preserved detected summary as reference", () => {
    const draft = createResumeDraftStoryFixture("existingProfile")
    renderDraft("existingProfile")
    const section = screen.getByTestId("resume-draft-summary")

    expect(section).toHaveTextContent(i18n.t("profile.importDraft.summaryPreserve"))
    expect(section).toHaveTextContent(i18n.t("profile.importDraft.summaryPreserveDescription"))
    expect(section).toHaveTextContent(draft.summary!)
  })

  it("omits the summary section when no summary was detected", () => {
    renderDraft("firstImport")

    expect(screen.queryByTestId("resume-draft-summary")).not.toBeInTheDocument()
    expect(
      screen.queryByText("No professional summary was detected in this resume."),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("本次简历没有可导入的个人总结。")).not.toBeInTheDocument()
  })

  it("keeps education, work, projects, and skills visible without a summary", () => {
    renderDraft("firstImport")

    expect(screen.getByTestId("resume-draft-education")).toBeInTheDocument()
    expect(screen.getByTestId("resume-draft-work")).toBeInTheDocument()
    expect(screen.getByTestId("resume-draft-projects")).toBeInTheDocument()
    expect(screen.getByTestId("resume-draft-skills")).toBeInTheDocument()
  })

  it("renders education details and date range", () => {
    const draft = createResumeDraftStoryFixture("firstImport")
    renderDraft("firstImport")
    const education = screen.getByTestId("resume-draft-education")

    expect(education).toHaveTextContent(draft.education[0]!.school)
    expect(education).toHaveTextContent(draft.education[0]!.degree!)
    expect(education).toHaveTextContent(draft.education[0]!.major!)
  })

  it("renders full work details with skill names and no skill UUIDs", () => {
    const draft = createResumeDraftStoryFixture("firstImport")
    renderDraft("firstImport")
    const work = screen.getByTestId("resume-draft-work")

    expect(work).toHaveTextContent(draft.workExperiences[0]!.title)
    expect(work).toHaveTextContent(draft.workExperiences[0]!.responsibilities[0]!)
    expect(work).toHaveTextContent(draft.workExperiences[0]!.achievements[0]!)
    expect(work).toHaveTextContent("React")
    expect(work).not.toHaveTextContent(draft.workExperiences[0]!.skillIds[0]!)
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

  it("renders candidate skills without inferring protected status from unrelated IDs", () => {
    const draft = createResumeDraftStoryFixture("protected")
    renderDraft("protected")
    const skills = screen.getByTestId("resume-draft-skills")

    for (const skill of draft.skills) expect(skills).toHaveTextContent(skill.name)
    expect(within(skills).queryByText(i18n.t("profile.importDraft.manualProtected"))).toBeNull()
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

  const skipReasons: ResumeImportSkipReason[] = [
    "start_date_missing",
    "start_date_precision_insufficient",
    "end_date_missing",
    "end_date_precision_insufficient",
    "current_status_unknown",
    "employment_type_unknown",
    "profile_schema_invalid",
  ]

  it.each(skipReasons)("localizes the %s skip reason without showing its code", (code) => {
    renderDraft("skippedAndUnresolved")
    const section = screen.getByTestId("resume-draft-skipped-items")

    expect(section).not.toHaveTextContent(code)
    expect(section).toHaveTextContent(i18n.t(`profile.importDraft.skipReasons.${code}`))
  })

  it("shows the one-based skipped source index", () => {
    renderDraft("skippedAndUnresolved")
    expect(screen.getByTestId("resume-draft-skipped-items")).toHaveTextContent(
      i18n.t("profile.importDraft.skippedItem", {
        index: 1,
        section: i18n.t("profile.sections.workExperience"),
      }),
    )
  })

  it("renders unresolved content as plain text", () => {
    renderDraft("skippedAndUnresolved")
    const section = screen.getByTestId("resume-draft-unresolved-items")

    expect(section).toHaveTextContent("<strong>unverified leadership scope</strong>")
    expect(section.querySelector("strong")).not.toBeInTheDocument()
  })

  it("hides attention sections when their collections are empty", () => {
    renderDraft("firstImport")
    expect(screen.queryByTestId("resume-draft-protected-items")).not.toBeInTheDocument()
    expect(screen.queryByTestId("resume-draft-skipped-items")).not.toBeInTheDocument()
    expect(screen.queryByTestId("resume-draft-unresolved-items")).not.toBeInTheDocument()
  })

  it("renders localized empty states for every collection", () => {
    renderDraft("minimal")
    expect(screen.getByText(i18n.t("profile.importDraft.emptyEducation"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.importDraft.emptyWorkExperience"))).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("profile.importDraft.emptyProjectExperience")),
    ).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.importDraft.emptySkills"))).toBeInTheDocument()
  })

  it("keeps conflict and generic apply errors safe and separate", () => {
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
