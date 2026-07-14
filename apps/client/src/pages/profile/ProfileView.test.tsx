import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfileSnapshot } from "@/models/profile"
import { ProfileView, type ProfileViewActions } from "@/pages/profile/ProfileView"
import { formatDate } from "@/pages/profile/components/profile-formatters"
import { renderWithProviders } from "@/test/render"

function createActions(): ProfileViewActions {
  return {
    cancelRecognition: vi.fn(async () => structuredClone(profileResponseMock)),
    cancelResumeUpdate: vi.fn(async () => structuredClone(profileResponseMock)),
    confirmRecognition: vi.fn(async () => structuredClone(profileResponseMock.profile!)),
    confirmResumeUpdate: vi.fn(async () => structuredClone(profileResponseMock.profile!)),
    createManualProfile: vi.fn(async () => structuredClone(profileResponseMock)),
    regenerateMatchingAnalysis: vi.fn(async () =>
      structuredClone(profileResponseMock.matchingAnalysis!),
    ),
    retryRecognition: vi.fn(async () => structuredClone(profileResponseMock)),
    saveSection: vi.fn(async () => structuredClone(profileResponseMock.profile!)),
    uploadInitialResume: vi.fn(async () => structuredClone(profileResponseMock)),
    uploadUpdatedResume: vi.fn(async () => structuredClone(profileResponseMock)),
  }
}

function renderReady(
  snapshot: JobProfileSnapshot = structuredClone(profileResponseMock),
  actions = createActions(),
) {
  return {
    actions,
    ...renderWithProviders(
      <ProfileView
        actions={actions}
        content={{ status: "ready", data: snapshot }}
        pending={{ analysis: false, cancelUpdate: false, confirmUpdate: false }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    ),
  }
}

describe("ProfileView", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders the full loading layout without a service", async () => {
    renderWithProviders(<ProfileView content={{ status: "loading" }} variant="default" />)
    expect(await screen.findByTestId("profile-loading-state")).toBeInTheDocument()
  })

  it("renders complete business data", async () => {
    renderReady()
    expect(await screen.findByText("Lin Chen")).toBeInTheDocument()
    expect(screen.getByText("Merchant Operations Console")).toBeInTheDocument()
    expect(screen.getByText("AWS Certified Cloud Practitioner")).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.completeness"))).toBeInTheDocument()
    expect(screen.getByText("100%")).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.pendingReviewCount", { count: 0 }))).toBeInTheDocument()
    expect(screen.getAllByText(i18n.t("profile.reviewStatus.confirmed")).length).toBeGreaterThan(0)
    expect(
      screen.getByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    ).toBeVisible()
    expect(screen.queryByText("档案已生效")).not.toBeInTheDocument()
    expect(screen.queryByText("匹配分析已同步")).not.toBeInTheDocument()
    expect(screen.queryByText("lin-chen-resume.pdf")).not.toBeInTheDocument()
    expect(screen.queryByTestId("profile-section-targetRoles")).not.toBeInTheDocument()
    expect(screen.queryByText("Frontend Technical Lead")).not.toBeInTheDocument()
  })

  it("opens the current resume details from the header and resets the dialog when closed", async () => {
    const user = userEvent.setup()
    const snapshot: JobProfileSnapshot = structuredClone(profileResponseMock)
    renderReady(snapshot)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("lin-chen-resume.pdf")).toBeInTheDocument()
    expect(
      within(dialog).getByText(i18n.t("profile.processingStatus.succeeded")),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        i18n.t("profile.resume.uploadedAt", {
          value: formatDate(snapshot.profile!.resume!.uploadedAt, i18n.language),
        }),
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/识别于/)).not.toBeInTheDocument()
    expect(screen.queryByText("替换简历")).not.toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    expect(within(dialog).getByLabelText(i18n.t("profile.import.text"))).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: i18n.t("common.close") }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(snapshot).toEqual(profileResponseMock)

    await user.click(screen.getByRole("button", { name: i18n.t("profile.actions.updateResume") }))
    expect(await screen.findByText("lin-chen-resume.pdf")).toBeInTheDocument()
  })

  it("opens the import form from the header when the profile has no resume", async () => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.resume = null
    const { actions } = renderReady(snapshot)
    const user = userEvent.setup()

    expect(
      await screen.findByRole("button", { name: i18n.t("profile.actions.uploadResume") }),
    ).toBeVisible()
    expect(screen.queryByText("lin-chen-resume.pdf")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: i18n.t("profile.actions.uploadResume") }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.import.submit") }))

    expect(actions.uploadInitialResume).toHaveBeenCalledOnce()
    expect(actions.uploadUpdatedResume).not.toHaveBeenCalled()
    expect(screen.getByText("Lin Chen")).toBeInTheDocument()
  })

  it("uses the updated-resume action after choosing update for an existing resume", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    expect(screen.getByText(i18n.t("profile.import.noFileSelected"))).toBeInTheDocument()
    const file = new File(["updated resume"], "updated-resume.pdf", {
      type: "application/pdf",
    })
    await user.upload(screen.getByLabelText(i18n.t("profile.import.file")), file)
    expect(screen.getByText("updated-resume.pdf")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    expect(actions.uploadUpdatedResume).toHaveBeenCalledOnce()
    expect(actions.uploadInitialResume).not.toHaveBeenCalled()
  })

  it("keeps resume update review inside the resume dialog", async () => {
    const user = userEvent.setup()
    const snapshot: JobProfileSnapshot = structuredClone(profileResponseMock)
    snapshot.resumeUpdate = {
      changeSummary: { changedItems: 2, missingItems: 1, newItems: 1 },
      createdAt: "2026-07-13T08:00:00.000Z",
      failureReason: null,
      id: "resume_update_uploaded",
      pendingReviewCount: 3,
      preservesManualChanges: true,
      proposedProfile: null,
      resume: structuredClone(snapshot.profile!.resume!),
      status: "awaitingConfirmation",
    }
    renderReady(snapshot)

    expect(screen.queryByTestId("profile-resume-update-review")).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByTestId("profile-resume-update-review")).toBeInTheDocument()
    expect(within(dialog).getByText(i18n.t("profile.import.updateTitle"))).toBeInTheDocument()
  })

  it.each([
    ["education", "education"],
    ["workExperience", "workExperiences"],
    ["projectExperience", "projectExperiences"],
    ["skills", "skills"],
  ] as const)("renders a local empty state for %s", async (section, property) => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile![property] = []
    renderReady(snapshot)
    const card = await screen.findByTestId("profile-section-" + section)
    expect(within(card).getAllByText(i18n.t("profile.emptySection")).length).toBeGreaterThan(0)
  })

  it("renders partial nullable data without failing the page", async () => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.basicInformation.phone = null
    snapshot.profile!.credentials = []
    snapshot.profile!.projectExperiences = []
    renderReady(snapshot)
    expect(
      await screen.findByRole("heading", { name: i18n.t("profile.title") }),
    ).toBeInTheDocument()
    expect(screen.queryByText("+86 138 0000 1234")).not.toBeInTheDocument()
  })

  it("keeps the stale matching-analysis alert without repeating its status in the header", async () => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.matchingAnalysisStale = true
    renderReady(snapshot)

    expect(await screen.findByTestId("profile-matching-analysis-stale")).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.matchingAnalysis.staleTitle"))).toBeInTheDocument()
    expect(screen.queryByText("匹配分析已过期")).not.toBeInTheDocument()
  })

  it("renders long user content verbatim", async () => {
    const snapshot = structuredClone(profileResponseMock)
    const longText = "Long profile content ".repeat(30)
    snapshot.profile!.basicInformation.personalSummary = longText
    renderReady(snapshot)
    expect(await screen.findByText(/Long profile content Long profile content/)).toBeInTheDocument()
  })

  it("renders a safe page error and invokes retry", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithProviders(<ProfileView onRetry={onRetry} variant="error" />)
    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("opens a business section editor without changing server data", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    renderReady(snapshot)
    const section = await screen.findByTestId("profile-section-basicInformation")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(screen.getByTestId("profile-editor-basicInformation")).toBeInTheDocument()
    expect(snapshot).toEqual(profileResponseMock)
  })

  it("adds and removes an experience only in the draft until save", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady()
    const section = await screen.findByTestId("profile-section-workExperience")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.addExperience") }))
    const deletes = screen.getAllByRole("button", { name: i18n.t("profile.editor.delete") })
    await user.click(deletes.at(-1)!)
    expect(actions.saveSection).not.toHaveBeenCalled()
  })
})
