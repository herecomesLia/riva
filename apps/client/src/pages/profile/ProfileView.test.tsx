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
import { renderWithProviders } from "@/test/render"

function createActions(): ProfileViewActions {
  return {
    applyResumeDraft: vi.fn(async () => undefined),
    createManualProfile: vi.fn(async () => structuredClone(profileResponseMock)),
    resetResumeWorkflow: vi.fn(() => undefined),
    retryResumeWorkflow: vi.fn(async () => undefined),
    saveSection: vi.fn(async () => structuredClone(profileResponseMock.profile!)),
    uploadResumeForInitialImport: vi.fn(async () => structuredClone(profileResponseMock)),
    uploadResumeForUpdate: vi.fn(async () => structuredClone(profileResponseMock)),
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
  hasResumeDocuments?: boolean,
) {
  return {
    actions,
    ...renderWithProviders(
      <ProfileView
        actions={actions}
        content={{ status: "ready", data: snapshot, hasResumeDocuments }}
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

  it("renders a non-interactive loading state", async () => {
    renderWithProviders(<ProfileView content={{ status: "loading" }} variant="default" />)
    const loadingState = await screen.findByTestId("profile-loading-state")
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

  it("renders the empty state and delegates manual creation", async () => {
    const user = userEvent.setup()
    const actions = createActions()
    renderWithProviders(
      <ProfileView
        actions={actions}
        capabilities={{
          credentials: false,
          resumeImport: false,
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
          resumeImport: false,
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

  it("renders the complete ready profile sections", async () => {
    renderReady()
    expect(await screen.findByTestId("profile-section-education")).toBeInTheDocument()
    expect(screen.getByTestId("profile-section-skills")).toBeInTheDocument()
    expect(screen.getByTestId("profile-section-workExperience")).toBeInTheDocument()
    expect(screen.getByTestId("profile-section-projectExperience")).toBeInTheDocument()
    const progressbar = screen.getByRole("progressbar", {
      name: i18n.t("profile.completeness"),
    })
    expect(progressbar).toHaveAttribute("aria-valuenow", "100")
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
