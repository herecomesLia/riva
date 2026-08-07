import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { toastSuccess } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
  },
}))

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createProfileMockSnapshot, profileResponseMock } from "@/mocks/data/profile"
import type { JobProfileSnapshot, ResumeImportDraft } from "@/models/profile"
import { ProfileView, type ProfileViewActions } from "@/pages/profile/ProfileView"
import { ProfileSectionEditDialog } from "@/pages/profile/components/ProfileSectionEditDialog"
import { formatDate } from "@/pages/profile/components/profile-formatters"
import { createResumeDraftStoryFixture } from "@/pages/profile/profile-resume-draft-story-fixtures"
import { renderWithProviders } from "@/test/render"

function createActions(): ProfileViewActions {
  return {
    applyResumeDraft: vi.fn(async () => undefined),
    createManualProfile: vi.fn(async () => structuredClone(profileResponseMock)),
    resetInitialResumeImport: vi.fn(async () => structuredClone(profileResponseMock)),
    resetResumeWorkflow: vi.fn(() => undefined),
    retryRecognition: vi.fn(async () => structuredClone(profileResponseMock)),
    retryResumeWorkflow: vi.fn(async () => undefined),
    retrySynchronization: vi.fn(async () => structuredClone(profileResponseMock)),
    saveSection: vi.fn(async () => structuredClone(profileResponseMock.profile!)),
    uploadInitialResume: vi.fn(async () => structuredClone(profileResponseMock)),
    uploadUpdatedResume: vi.fn(async () => structuredClone(profileResponseMock)),
  }
}

const workflowDraft: ResumeImportDraft = {
  appliedAt: null,
  appliedProfileVersion: null,
  baseProfileId: null,
  baseProfileVersion: null,
  canApply: true,
  changeSummary: { changedItems: 2, missingItems: 1, newItems: 3 },
  createdAt: "2026-08-06T12:00:00Z",
  draftVersion: 1,
  education: [],
  parsingResultVersion: 1,
  projectExperiences: [],
  protectedItems: [],
  resumeDocumentId: "11111111-1111-4111-8111-111111111111",
  skippedItems: [],
  skills: [],
  sourceRunId: "22222222-2222-4222-8222-222222222222",
  status: "ready",
  summary: "Resume summary",
  summaryAction: "set",
  unresolvedItems: [],
  updatedAt: "2026-08-06T12:00:00Z",
  workExperiences: [],
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
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    ),
  }
}

function formatMonthForLocale(value: string) {
  const [year, month] = value.split("-").map(Number)

  return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year!, month! - 1, 1)))
}

function monthName(index: number) {
  return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, index, 1)))
}

async function selectMonth(trigger: HTMLElement, year: string, monthIndex: number) {
  const user = userEvent.setup()

  await user.click(trigger)
  await user.click(screen.getByLabelText(i18n.t("profile.monthPicker.year")))
  await user.click(await screen.findByRole("option", { name: year }))
  await user.click(screen.getByLabelText(i18n.t("profile.monthPicker.month")))
  await user.click(await screen.findByRole("option", { name: monthName(monthIndex) }))
}

describe("ProfileView", () => {
  beforeEach(async () => {
    toastSuccess.mockClear()
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders the full loading layout without a service", async () => {
    renderWithProviders(<ProfileView content={{ status: "loading" }} variant="default" />)
    const loadingState = await screen.findByTestId("profile-loading-state")
    const summary = within(loadingState).getByTestId("profile-loading-summary-sections")

    expect(
      within(loadingState).getByRole("heading", {
        level: 1,
        name: i18n.t("profile.title"),
      }),
    ).toBeInTheDocument()
    expect(within(loadingState).getByText(i18n.t("profile.description"))).toBeInTheDocument()
    for (const section of ["education", "skills", "workExperience", "projectExperience"] as const) {
      expect(
        within(loadingState).getByRole("heading", {
          level: 2,
          name: i18n.t(`profile.sections.${section}`),
        }),
      ).toBeInTheDocument()
    }
    expect(within(summary).getAllByTestId("profile-skeleton-card")).toHaveLength(2)
    expect(within(loadingState).getAllByTestId("profile-skeleton-card")).toHaveLength(4)
    expect(
      within(loadingState).queryByRole("button", {
        name: i18n.t("profile.actions.edit"),
      }),
    ).not.toBeInTheDocument()
    expect(
      within(loadingState).queryByRole("button", {
        name: i18n.t("profile.actions.updateResume"),
      }),
    ).not.toBeInTheDocument()
  })

  it("prioritizes parsing workflow over the empty-profile upload form", async () => {
    renderWithProviders(
      <ProfileView
        actions={createActions()}
        content={{
          data: createProfileMockSnapshot("noProfile"),
          resumeWorkflow: {
            isRetrying: false,
            mode: "initial",
            resumeId: workflowDraft.resumeDocumentId,
            status: "parsing",
            synchronizationError: false,
          },
          status: "ready",
        }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    expect(await screen.findByTestId("profile-processing-state")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-resume-import-form")).not.toBeInTheDocument()
  })

  it("keeps the Profile header beside an update parsing workflow", async () => {
    renderWithProviders(
      <ProfileView
        actions={createActions()}
        content={{
          data: createProfileMockSnapshot("complete"),
          resumeWorkflow: {
            isRetrying: false,
            mode: "update",
            resumeId: workflowDraft.resumeDocumentId,
            status: "parsing",
            synchronizationError: false,
          },
          status: "ready",
        }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    expect(await screen.findByTestId("profile-processing-state")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 1, name: i18n.t("profile.title") }),
    ).toBeInTheDocument()
  })

  it("renders a safe workflow failure and delegates retry", async () => {
    const actions = createActions()
    renderWithProviders(
      <ProfileView
        actions={actions}
        content={{
          data: createProfileMockSnapshot("noProfile"),
          resumeWorkflow: {
            canRetry: true,
            failureReason: null,
            isRetrying: false,
            mode: "initial",
            resumeId: workflowDraft.resumeDocumentId,
            status: "failed",
          },
          status: "ready",
        }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    const failure = await screen.findByTestId("profile-recognition-failure")
    expect(failure).toHaveTextContent(i18n.t("profile.lifecycle.failed.description"))
    await userEvent.click(
      within(failure).getByRole("button", { name: i18n.t("profile.actions.retryRecognition") }),
    )
    expect(actions.retryResumeWorkflow).toHaveBeenCalledOnce()
  })

  it("renders the Resume Draft review", async () => {
    renderWithProviders(
      <ProfileView
        actions={createActions()}
        content={{
          data: createProfileMockSnapshot("noProfile"),
          resumeWorkflow: {
            applyConflict: null,
            applyError: false,
            draft: workflowDraft,
            mode: "initial",
            resumeId: workflowDraft.resumeDocumentId,
            status: "draftReady",
          },
          status: "ready",
        }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    expect(await screen.findByTestId("profile-resume-draft-review")).toHaveTextContent(
      i18n.t("profile.importDraft.title"),
    )
    expect(screen.queryByTestId("profile-resume-import-form")).not.toBeInTheDocument()
  })

  it("keeps the profile header above an existing-profile Draft review", async () => {
    renderWithProviders(
      <ProfileView
        actions={createActions()}
        content={{
          data: createProfileMockSnapshot("complete"),
          resumeWorkflow: {
            applyConflict: null,
            applyError: false,
            draft: createResumeDraftStoryFixture("existingProfile"),
            mode: "update",
            resumeId: workflowDraft.resumeDocumentId,
            status: "draftReady",
          },
          status: "ready",
        }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    expect(
      await screen.findByRole("heading", { level: 1, name: i18n.t("profile.title") }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("profile-resume-draft-review")).toBeInTheDocument()
  })

  it("shows a safe conflict alert in Draft review", async () => {
    renderWithProviders(
      <ProfileView
        actions={createActions()}
        content={{
          data: createProfileMockSnapshot("complete"),
          resumeWorkflow: {
            applyConflict: "resume_import_profile_version_conflict",
            applyError: false,
            draft: workflowDraft,
            mode: "update",
            resumeId: workflowDraft.resumeDocumentId,
            status: "draftReady",
          },
          status: "ready",
        }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    expect(await screen.findByTestId("profile-resume-draft-conflict")).toHaveTextContent(
      i18n.t("profile.importDraft.conflictDescription"),
    )
  })

  it("disables Draft apply and cancel controls while applying", async () => {
    renderWithProviders(
      <ProfileView
        actions={createActions()}
        content={{
          data: createProfileMockSnapshot("complete"),
          resumeWorkflow: {
            draft: workflowDraft,
            mode: "update",
            resumeId: workflowDraft.resumeDocumentId,
            status: "applying",
          },
          status: "ready",
        }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    expect(
      await screen.findByRole("button", { name: i18n.t("profile.importDraft.applying") }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("profile.importDraft.cancel") }),
    ).toBeDisabled()
    expect(screen.getByTestId("resume-draft-summary")).toBeVisible()
    expect(screen.getByTestId("resume-draft-education")).toBeVisible()
  })

  it("keeps legacy idle rendering when resumeWorkflow is omitted", async () => {
    renderReady(createProfileMockSnapshot("complete"))

    expect(await screen.findByTestId("profile-section-education")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-resume-draft-review")).not.toBeInTheDocument()
  })

  it("offers manual creation and hides resume import when the API lacks resume capabilities", async () => {
    const user = userEvent.setup()
    const actions = createActions()
    renderWithProviders(
      <ProfileView
        actions={actions}
        capabilities={{
          credentials: false,
          matchingAnalysis: false,
          resumeImport: false,
          resumeRecognition: false,
          resumeUpdate: false,
          targetRoles: false,
        }}
        content={{ status: "ready", data: createProfileMockSnapshot("noProfile") }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    expect(await screen.findByTestId("profile-empty-state")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-resume-import-form")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: i18n.t("profile.actions.manualEntry") }))
    expect(actions.createManualProfile).toHaveBeenCalledOnce()
  })

  it("hides resume update controls when the API lacks resume capabilities", async () => {
    const actions = createActions()
    renderWithProviders(
      <ProfileView
        actions={actions}
        capabilities={{
          credentials: false,
          matchingAnalysis: false,
          resumeImport: false,
          resumeRecognition: false,
          resumeUpdate: false,
          targetRoles: false,
        }}
        content={{ status: "ready", data: structuredClone(profileResponseMock) }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    expect(await screen.findByTestId("profile-section-education")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    ).not.toBeInTheDocument()
  })

  it("uses the initial-resume action only when no profile exists", async () => {
    const actions = createActions()
    const user = userEvent.setup()
    renderWithProviders(
      <ProfileView
        actions={actions}
        content={{ status: "ready", data: createProfileMockSnapshot("noProfile") }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    )

    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    expect(actions.uploadInitialResume).toHaveBeenCalledOnce()
    expect(actions.uploadUpdatedResume).not.toHaveBeenCalled()
  })

  it("renders the complete ready-page lifecycle and header", async () => {
    renderReady()
    expect(
      await screen.findByRole("heading", { name: i18n.t("profile.title") }),
    ).toBeInTheDocument()
    const progressbar = screen.getByRole("progressbar", {
      name: i18n.t("profile.completeness"),
    })
    expect(progressbar).toHaveAttribute("aria-valuenow", "100")
    expect(screen.getByText("100%")).toBeInTheDocument()
    expect(
      screen.getByText(
        i18n.t("profile.updatedAt", {
          value: formatDate(profileResponseMock.profile!.updatedAt, i18n.language),
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    ).toBeVisible()
    expect(screen.queryByText("档案已生效")).not.toBeInTheDocument()
    expect(screen.queryByText("匹配分析已同步")).not.toBeInTheDocument()
    expect(screen.queryByText("lin-chen-resume.pdf")).not.toBeInTheDocument()
    expect(screen.queryByTestId("profile-section-targetRoles")).not.toBeInTheDocument()
    expect(screen.queryByText("Frontend Technical Lead")).not.toBeInTheDocument()
    expect(screen.queryByText(/待确认/)).not.toBeInTheDocument()
    expect(screen.queryByText(/已确认/)).not.toBeInTheDocument()
  })

  it("keeps recognition-failure actions with the supplied failure reason", async () => {
    const user = userEvent.setup()
    const snapshot = createProfileMockSnapshot("initialResumeRecognitionFailed")
    const { actions } = renderReady(snapshot)
    const alert = await screen.findByTestId("profile-recognition-failure")

    expect(alert).toHaveTextContent(i18n.t("profile.lifecycle.failed.title"))
    expect(alert).toHaveTextContent(
      "The resume could not be recognized because its text layer is unavailable.",
    )

    await user.click(
      within(alert).getByRole("button", { name: i18n.t("profile.actions.retryRecognition") }),
    )
    await user.click(
      within(alert).getByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    await user.click(
      within(alert).getByRole("button", { name: i18n.t("profile.actions.manualEntry") }),
    )

    expect(actions.retryRecognition).toHaveBeenCalledWith(
      snapshot.profile!.profileId,
      snapshot.profile!.resume!.id,
    )
    expect(actions.resetInitialResumeImport).toHaveBeenCalledWith(
      snapshot.profile!.profileId,
      snapshot.profile!.resume!.id,
    )
    expect(actions.createManualProfile).toHaveBeenCalledOnce()
  })

  it("uses the default recognition-failure description when no reason is available", async () => {
    const snapshot = createProfileMockSnapshot("initialResumeRecognitionFailedWithoutReason")
    renderReady(snapshot)

    expect(await screen.findByTestId("profile-recognition-failure")).toHaveTextContent(
      i18n.t("profile.lifecycle.failed.description"),
    )
  })

  it("keeps the recognition failure page and shows safe feedback when manual entry fails", async () => {
    const user = userEvent.setup()
    const actions = createActions()
    actions.createManualProfile = vi.fn(async () => {
      throw new Error("manual profile request failed")
    })
    renderReady(createProfileMockSnapshot("initialResumeRecognitionFailed"), actions)

    await user.click(
      within(await screen.findByTestId("profile-recognition-failure")).getByRole("button", {
        name: i18n.t("profile.actions.manualEntry"),
      }),
    )

    expect(await screen.findByText(i18n.t("profile.lifecycle.actionFailed"))).toBeInTheDocument()
    expect(screen.getByTestId("profile-recognition-failure")).toBeInTheDocument()
    expect(screen.queryByText("manual profile request failed")).not.toBeInTheDocument()
  })

  it("keeps the recognition failure page and shows safe feedback when reupload reset fails", async () => {
    const user = userEvent.setup()
    const actions = createActions()
    actions.resetInitialResumeImport = vi.fn(async () => {
      throw new Error("reset request failed")
    })
    renderReady(createProfileMockSnapshot("initialResumeRecognitionFailed"), actions)

    await user.click(
      within(await screen.findByTestId("profile-recognition-failure")).getByRole("button", {
        name: i18n.t("profile.actions.updateResume"),
      }),
    )

    expect(await screen.findByText(i18n.t("profile.lifecycle.actionFailed"))).toBeInTheDocument()
    expect(screen.getByTestId("profile-recognition-failure")).toBeInTheDocument()
    expect(screen.queryByText("reset request failed")).not.toBeInTheDocument()
  })

  it("keeps the recognition failure page and shows safe feedback when recognition retry fails", async () => {
    const user = userEvent.setup()
    const actions = createActions()
    actions.retryRecognition = vi.fn(async () => {
      throw new Error("recognition retry request failed")
    })
    renderReady(createProfileMockSnapshot("initialResumeRecognitionFailed"), actions)

    await user.click(
      within(await screen.findByTestId("profile-recognition-failure")).getByRole("button", {
        name: i18n.t("profile.actions.retryRecognition"),
      }),
    )

    expect(await screen.findByText(i18n.t("profile.lifecycle.actionFailed"))).toBeInTheDocument()
    expect(screen.getByTestId("profile-recognition-failure")).toBeInTheDocument()
    expect(screen.queryByText("recognition retry request failed")).not.toBeInTheDocument()
  })

  it("groups only education and skills in the summary sections", async () => {
    renderReady()

    const summarySections = await screen.findByTestId("profile-summary-sections")

    expect(within(summarySections).getByTestId("profile-section-education")).toBeInTheDocument()
    expect(within(summarySections).getByTestId("profile-section-skills")).toBeInTheDocument()
    expect(
      within(summarySections).queryByTestId("profile-section-credentials"),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId("profile-section-workExperience")).toBeInTheDocument()
    expect(screen.getByTestId("profile-section-projectExperience")).toBeInTheDocument()
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
    const snapshot = createProfileMockSnapshot("profileWithoutResume")
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

    expect(actions.uploadUpdatedResume).toHaveBeenCalledOnce()
    expect(actions.uploadInitialResume).not.toHaveBeenCalled()
    expect(screen.getByText("Fudan University")).toBeInTheDocument()
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

  it("keeps the completed resume update summary inside the resume dialog", async () => {
    const user = userEvent.setup()
    const snapshot = createProfileMockSnapshot("resumeUpdateSucceeded")
    renderReady(snapshot)

    expect(screen.queryByTestId("profile-resume-update-summary")).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByTestId("profile-resume-update-summary")).toBeInTheDocument()
    expect(within(dialog).getByText(i18n.t("profile.import.updateTitle"))).toBeInTheDocument()
  })

  it("renders partial nullable data without failing the page", async () => {
    const snapshot = createProfileMockSnapshot("partial")
    renderReady(snapshot)
    expect(
      await screen.findByRole("heading", { name: i18n.t("profile.title") }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("progressbar", { name: i18n.t("profile.completeness") }),
    ).toHaveAttribute("aria-valuenow", "75")
    expect(screen.getByText("75%")).toBeInTheDocument()
    expect(screen.queryByText(/待确认/)).not.toBeInTheDocument()
  })

  it("does not render matching-analysis regeneration controls", async () => {
    const snapshot = createProfileMockSnapshot("matchingAnalysisStale")
    renderReady(snapshot)

    expect(await screen.findByTestId("profile-section-education")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-matching-analysis-stale")).not.toBeInTheDocument()
    expect(screen.queryByText(/重新生成匹配分析/)).not.toBeInTheDocument()
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

  it("opens the education editor in a dialog without replacing the read-only card", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    renderReady(snapshot)
    const section = await screen.findByTestId("profile-section-education")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")

    expect(within(section).getByText("Fudan University")).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        i18n.t("profile.editor.dialogTitle", {
          section: i18n.t("profile.sections.education"),
        }),
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByTestId("profile-editor-education")).toBeInTheDocument()
    expect(snapshot).toEqual(profileResponseMock)
  })

  it.each(["education", "workExperience", "projectExperience", "skills"] as const)(
    "opens the %s editor in the shared dialog",
    async (sectionName) => {
      const user = userEvent.setup()
      renderReady()
      const section = await screen.findByTestId(`profile-section-${sectionName}`)
      await user.click(
        within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }),
      )

      const dialog = await screen.findByRole("dialog")
      expect(
        within(dialog).getByText(
          i18n.t("profile.editor.dialogTitle", {
            section: i18n.t(`profile.sections.${sectionName}`),
          }),
        ),
      ).toBeInTheDocument()
      expect(within(dialog).getByTestId(`profile-editor-${sectionName}`)).toBeInTheDocument()
    },
  )

  it("edits skills with names only and omits category from saved values", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady()
    const section = await screen.findByTestId("profile-section-skills")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getAllByLabelText(i18n.t("profile.field.skillName"))).toHaveLength(
      profileResponseMock.profile!.skills.length,
    )
    expect(
      within(dialog).getAllByRole("button", { name: i18n.t("profile.editor.delete") }),
    ).toHaveLength(profileResponseMock.profile!.skills.length)
    expect(within(dialog).queryByLabelText(/技能分类|Skill category/)).not.toBeInTheDocument()
    expect(dialog.querySelector("datalist")).toBeNull()

    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("profile.editor.addSkill") }),
    )
    const skillNames = within(dialog).getAllByLabelText(i18n.t("profile.field.skillName"))
    expect(skillNames).toHaveLength(profileResponseMock.profile!.skills.length + 1)
    expect(skillNames.at(-1)).toHaveValue("")

    await user.clear(skillNames[0]!)
    await user.type(skillNames[0]!, "  React Native  ")
    await user.type(skillNames.at(-1)!, "Testing Library")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(actions.saveSection).toHaveBeenCalledOnce())
    const savedValues = vi.mocked(actions.saveSection).mock.calls[0]![0].values as Array<{
      id: string
      name: string
    }>
    expect(savedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "skill_react", name: "React Native" }),
      ]),
    )
    expect(savedValues.every((skill) => Object.keys(skill).sort().join(",") === "id,name")).toBe(
      true,
    )
    expect(savedValues.map((skill) => skill.name)).toEqual([
      "React Native",
      "TypeScript",
      "Design systems",
      "JavaScript",
      "TanStack Query",
      "Testing Library",
    ])
  })

  it("validates required and duplicate skill names", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady()
    const section = await screen.findByTestId("profile-section-skills")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const skillNames = within(dialog).getAllByLabelText(i18n.t("profile.field.skillName"))

    await user.clear(skillNames[0]!)
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))
    expect(actions.saveSection).not.toHaveBeenCalled()

    await user.type(skillNames[0]!, "React")
    await user.clear(skillNames[1]!)
    await user.type(skillNames[1]!, "React")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))
    expect(actions.saveSection).not.toHaveBeenCalled()
  })

  it("keeps skill deletion in the draft until save", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    const { actions } = renderReady(snapshot)
    const section = await screen.findByTestId("profile-section-skills")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")

    await user.click(
      within(dialog)
        .getAllByRole("button", { name: i18n.t("profile.editor.delete") })
        .at(1)!,
    )

    expect(within(dialog).getAllByLabelText(i18n.t("profile.field.skillName"))).toHaveLength(
      profileResponseMock.profile!.skills.length - 1,
    )
    expect(
      within(dialog)
        .getAllByLabelText(i18n.t("profile.field.skillName"))
        .map((input) => input.getAttribute("value")),
    ).toEqual(["React", "Design systems", "JavaScript", "TanStack Query"])
    expect(actions.saveSection).not.toHaveBeenCalled()
    expect(snapshot).toEqual(profileResponseMock)
  })

  it("keeps the credentials editor available independently", async () => {
    renderWithProviders(
      <ProfileSectionEditDialog
        onDirtyChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSave={vi.fn(async () => undefined)}
        open
        profile={structuredClone(profileResponseMock.profile!)}
        section="credentials"
      />,
      { router: false },
    )

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByTestId("profile-editor-credentials")).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("AWS Certified Cloud Practitioner")).toBeInTheDocument()
    expect(
      within(dialog).getAllByLabelText(i18n.t("profile.formField.awardedAt"))[0],
    ).toHaveTextContent(formatMonthForLocale("2023-08"))
    expect(
      within(dialog).getAllByLabelText(i18n.t("profile.formField.expiresAt"))[0],
    ).toHaveTextContent(i18n.t("profile.monthPicker.placeholder"))
  })

  it("renders only the supported education fields in the editor", async () => {
    const user = userEvent.setup()
    renderReady()
    const section = await screen.findByTestId("profile-section-education")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")

    for (const field of ["school", "degree", "major", "startDate", "endDate"] as const) {
      expect(within(dialog).getAllByLabelText(i18n.t(`profile.formField.${field}`))).toHaveLength(2)
    }
    expect(within(dialog).queryByLabelText(i18n.t("profile.formField.description"))).toBeNull()
  })

  it("manages an education end date with the present option", async () => {
    const user = userEvent.setup()
    renderReady()
    const section = await screen.findByTestId("profile-section-education")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const present = within(dialog).getAllByRole("checkbox", {
      name: i18n.t("profile.field.present"),
    })[0]!
    const endDate = within(dialog).getAllByLabelText(i18n.t("profile.formField.endDate"))[0]!

    expect(present).not.toBeChecked()
    expect(endDate).toHaveTextContent(formatMonthForLocale("2018-06"))

    await user.click(present)
    expect(present).toBeChecked()
    expect(
      within(dialog).getAllByLabelText(i18n.t("profile.formField.endDate"))[0],
    ).toHaveAttribute("type", "text")
    expect(within(dialog).getAllByLabelText(i18n.t("profile.formField.endDate"))[0]).toBeDisabled()
    expect(within(dialog).getAllByLabelText(i18n.t("profile.formField.endDate"))[0]).toHaveValue(
      i18n.t("profile.field.present"),
    )

    await user.click(present)
    const restoredEndDate = within(dialog).getAllByLabelText(
      i18n.t("profile.formField.endDate"),
    )[0]!
    expect(restoredEndDate).toHaveTextContent(i18n.t("profile.monthPicker.placeholder"))

    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))
    expect(
      await within(dialog).findByText(i18n.t("profile.editor.validation.required")),
    ).toBeInTheDocument()

    await selectMonth(restoredEndDate, "2010", 0)
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))
    expect(
      await within(dialog).findByText(i18n.t("profile.editor.validation.dateRange")),
    ).toBeInTheDocument()
  })

  it("saves selected start and end months as YYYY-MM values", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady()
    const section = await screen.findByTestId("profile-section-education")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const startDate = within(dialog).getAllByLabelText(i18n.t("profile.formField.startDate"))[0]!
    const endDate = within(dialog).getAllByLabelText(i18n.t("profile.formField.endDate"))[0]!

    await selectMonth(startDate, "2013", 7)
    await selectMonth(endDate, "2018", 6)
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(actions.saveSection).toHaveBeenCalledOnce())
    expect(actions.saveSection).toHaveBeenCalledWith(
      expect.objectContaining({
        section: "education",
        values: expect.arrayContaining([
          expect.objectContaining({
            endDate: "2018-07",
            id: "education_fudan_2018",
            startDate: "2013-08",
          }),
        ]),
      }),
    )
  })

  it.each([
    ["education", "education_fudan_2018", 0],
    ["workExperience", "work_orbit_2018", 1],
    ["projectExperience", "project_merchant_console", 0],
  ] as const)(
    "saves %s with a null end date when marked present",
    async (sectionName, itemId, itemIndex) => {
      const user = userEvent.setup()
      const { actions } = renderReady()
      const section = await screen.findByTestId(`profile-section-${sectionName}`)
      await user.click(
        within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }),
      )
      const dialog = await screen.findByRole("dialog")
      const present = within(dialog).getAllByRole("checkbox", {
        name: i18n.t("profile.field.present"),
      })[itemIndex]!

      if (sectionName !== "projectExperience") await user.click(present)
      await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))

      await waitFor(() => expect(actions.saveSection).toHaveBeenCalledOnce())
      expect(actions.saveSection).toHaveBeenCalledWith(
        expect.objectContaining({
          section: sectionName,
          values: expect.arrayContaining([
            expect.objectContaining({
              endDate: null,
              id: itemId,
              ...(sectionName === "projectExperience" ? {} : { isCurrent: true }),
            }),
          ]),
        }),
      )
    },
  )

  it("keeps experience additions and deletions in the draft until save", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    const { actions } = renderReady(snapshot)
    const section = await screen.findByTestId("profile-section-workExperience")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("profile.editor.addExperience") }),
    )
    const deletes = within(dialog).getAllByRole("button", { name: i18n.t("profile.editor.delete") })
    await user.click(deletes.at(-1)!)
    expect(actions.saveSection).not.toHaveBeenCalled()
    expect(snapshot).toEqual(profileResponseMock)
  })

  it("keeps education additions and deletions in the draft until save", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    const { actions } = renderReady(snapshot)
    const section = await screen.findByTestId("profile-section-education")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("profile.editor.addExperience") }),
    )
    await user.click(
      within(dialog)
        .getAllByRole("button", { name: i18n.t("profile.editor.delete") })
        .at(-1)!,
    )

    expect(actions.saveSection).not.toHaveBeenCalled()
    expect(snapshot).toEqual(profileResponseMock)
  })

  it("saves from the dialog, closes it, and keeps the read-only card visible", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    const { actions } = renderReady(snapshot)
    const section = await screen.findByTestId("profile-section-education")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const school = within(dialog).getAllByLabelText(i18n.t("profile.formField.school"))[0]!

    await user.clear(school)
    await user.type(school, "Updated University")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(actions.saveSection).toHaveBeenCalledOnce())
    expect(actions.saveSection).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: snapshot.profile!.profileId,
        section: "education",
        version: snapshot.profile!.version,
        values: expect.arrayContaining([expect.objectContaining({ school: "Updated University" })]),
      }),
    )
    expect(actions.saveSection).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.not.arrayContaining([
          expect.objectContaining({ description: expect.anything() }),
        ]),
      }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByTestId("profile-section-education")).toBeInTheDocument()
    expect(toastSuccess).toHaveBeenCalledWith(i18n.t("profile.editor.saveSuccess"), {
      duration: 2500,
      id: "profile-save-success",
    })
    expect(screen.queryByTestId("profile-save-success")).not.toBeInTheDocument()
  })

  it("keeps the dialog and draft open when saving fails", async () => {
    const user = userEvent.setup()
    const actions = createActions()
    actions.saveSection = vi.fn(async () => {
      throw new Error("save failed")
    })
    renderReady(structuredClone(profileResponseMock), actions)
    const section = await screen.findByTestId("profile-section-education")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const school = within(dialog).getAllByLabelText(i18n.t("profile.formField.school"))[0]!

    await user.clear(school)
    await user.type(school, "Retry University")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await within(dialog).findByText(i18n.t("profile.editor.saveError"))).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("Retry University")).toBeInTheDocument()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("closes an unchanged dialog without a discard confirmation", async () => {
    const user = userEvent.setup()
    renderReady()
    const section = await screen.findByTestId("profile-section-education")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")

    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.cancel") }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("confirms before discarding a dirty dialog and resets the next editor session", async () => {
    const user = userEvent.setup()
    renderReady()
    const section = await screen.findByTestId("profile-section-education")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const school = within(dialog).getAllByLabelText(i18n.t("profile.formField.school"))[0]!

    await user.clear(school)
    await user.type(school, "Discarded University")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.cancel") }))

    const discardDialog = await screen.findByRole("alertdialog")
    expect(
      within(discardDialog).getByText(i18n.t("profile.dialog.discardDraftTitle")),
    ).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("Discarded University")).toBeInTheDocument()

    await user.click(
      within(discardDialog).getByRole("button", { name: i18n.t("profile.dialog.stayEditing") }),
    )
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("Discarded University")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.cancel") }))
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: i18n.t("profile.dialog.discardChanges"),
      }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(
      within(await screen.findByRole("dialog")).getAllByLabelText(
        i18n.t("profile.formField.school"),
      )[0],
    ).toHaveValue("Fudan University")
  })
})
