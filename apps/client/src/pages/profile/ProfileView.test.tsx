import { screen, waitFor, within } from "@testing-library/react"
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
    createManualProfile: vi.fn(async () => structuredClone(profileResponseMock)),
    resetInitialResumeImport: vi.fn(async () => structuredClone(profileResponseMock)),
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
    expect(await screen.findByText("Fudan University")).toBeInTheDocument()
    expect(screen.getByText("Northstar Commerce")).toBeInTheDocument()
    expect(screen.getByText("Merchant Operations Console")).toBeInTheDocument()
    expect(screen.getAllByText("React").length).toBeGreaterThan(0)
    expect(screen.getByText("AWS Certified Cloud Practitioner")).toBeInTheDocument()
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

  it("groups education, skills, and credentials in the summary sections", async () => {
    renderReady()

    const summarySections = await screen.findByTestId("profile-summary-sections")

    expect(within(summarySections).getByTestId("profile-section-education")).toBeInTheDocument()
    expect(within(summarySections).getByTestId("profile-section-skills")).toBeInTheDocument()
    expect(within(summarySections).getByTestId("profile-section-credentials")).toBeInTheDocument()
    expect(screen.getByTestId("profile-section-workExperience")).toBeInTheDocument()
    expect(screen.getByTestId("profile-section-projectExperience")).toBeInTheDocument()
  })

  it("navigates shared education records without replacing the full-section editor", async () => {
    const user = userEvent.setup()
    renderReady()

    const section = await screen.findByTestId("profile-section-education")
    const previousName = i18n.t("profile.carousel.previous", {
      section: i18n.t("profile.sections.education"),
    })
    const nextName = i18n.t("profile.carousel.next", {
      section: i18n.t("profile.sections.education"),
    })

    expect(within(section).getByText("Fudan University")).toBeInTheDocument()
    expect(within(section).queryByText("Tongji University")).not.toBeInTheDocument()
    expect(within(section).queryByRole("button", { name: previousName })).not.toBeInTheDocument()

    await user.click(within(section).getByRole("button", { name: nextName }))
    expect(within(section).getByText("Tongji University")).toBeInTheDocument()
    expect(within(section).queryByText("Fudan University")).not.toBeInTheDocument()
    expect(within(section).getByRole("button", { name: previousName })).toBeInTheDocument()
    expect(within(section).queryByRole("button", { name: nextName })).not.toBeInTheDocument()

    await user.click(within(section).getByRole("button", { name: previousName }))
    expect(within(section).getByText("Fudan University")).toBeInTheDocument()
    expect(within(section).queryByRole("button", { name: previousName })).not.toBeInTheDocument()
    expect(within(section).getByRole("button", { name: nextName })).toBeInTheDocument()

    await user.click(within(section).getByRole("button", { name: nextName }))
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByTestId("profile-editor-education")).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("Fudan University")).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("Tongji University")).toBeInTheDocument()
  })

  it("shows linear navigation controls for three education records", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.education.push({
      degree: "Master of Science",
      endDate: "2024-06",
      id: "education_riva_2024",
      isCurrent: false,
      major: "Human-Computer Interaction",
      school: "Riva University",
      source: "userAdded",
      startDate: "2021-09",
    })
    renderReady(snapshot)

    const section = await screen.findByTestId("profile-section-education")
    const previousName = i18n.t("profile.carousel.previous", {
      section: i18n.t("profile.sections.education"),
    })
    const nextName = i18n.t("profile.carousel.next", {
      section: i18n.t("profile.sections.education"),
    })

    expect(within(section).queryByRole("button", { name: previousName })).not.toBeInTheDocument()
    await user.click(within(section).getByRole("button", { name: nextName }))
    expect(within(section).getByText("Tongji University")).toBeInTheDocument()
    expect(within(section).getByRole("button", { name: previousName })).toBeInTheDocument()
    expect(within(section).getByRole("button", { name: nextName })).toBeInTheDocument()

    await user.click(within(section).getByRole("button", { name: nextName }))
    expect(within(section).getByText("Riva University")).toBeInTheDocument()
    expect(within(section).getByRole("button", { name: previousName })).toBeInTheDocument()
    expect(within(section).queryByRole("button", { name: nextName })).not.toBeInTheDocument()
  })

  it("does not render education carousel controls for one record", async () => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.education = snapshot.profile!.education.slice(0, 1)
    renderReady(snapshot)

    const section = await screen.findByTestId("profile-section-education")

    expect(
      within(section).queryByRole("button", {
        name: i18n.t("profile.carousel.previous", {
          section: i18n.t("profile.sections.education"),
        }),
      }),
    ).not.toBeInTheDocument()
    expect(
      within(section).queryByRole("button", {
        name: i18n.t("profile.carousel.next", {
          section: i18n.t("profile.sections.education"),
        }),
      }),
    ).not.toBeInTheDocument()
  })

  it("navigates credentials linearly while retaining their type badge and accessible link", async () => {
    const user = userEvent.setup()
    renderReady()

    const section = await screen.findByTestId("profile-section-credentials")
    const previousName = i18n.t("profile.carousel.previous", {
      section: i18n.t("profile.sections.credentials"),
    })
    const nextName = i18n.t("profile.carousel.next", {
      section: i18n.t("profile.sections.credentials"),
    })

    expect(within(section).getByText("AWS Certified Cloud Practitioner")).toBeInTheDocument()
    expect(
      within(section).getByText(i18n.t("profile.credentialType.certificate")),
    ).toBeInTheDocument()
    expect(within(section).getByRole("link", { name: "AWS-CCP-2023-0174" })).toBeInTheDocument()
    expect(within(section).queryByText("Product Excellence Award")).not.toBeInTheDocument()
    expect(within(section).queryByRole("button", { name: previousName })).not.toBeInTheDocument()

    await user.click(within(section).getByRole("button", { name: nextName }))
    expect(within(section).getByText("Product Excellence Award")).toBeInTheDocument()
    expect(within(section).getByText(i18n.t("profile.credentialType.award"))).toBeInTheDocument()
    expect(within(section).getByRole("button", { name: previousName })).toBeInTheDocument()
    expect(within(section).queryByRole("button", { name: nextName })).not.toBeInTheDocument()

    await user.click(within(section).getByRole("button", { name: previousName }))
    expect(within(section).getByText("AWS Certified Cloud Practitioner")).toBeInTheDocument()
  })

  it("does not render credential carousel controls for one record", async () => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.credentials = snapshot.profile!.credentials.slice(0, 1)
    renderReady(snapshot)

    const section = await screen.findByTestId("profile-section-credentials")

    expect(
      within(section).queryByRole("button", {
        name: i18n.t("profile.carousel.previous", {
          section: i18n.t("profile.sections.credentials"),
        }),
      }),
    ).not.toBeInTheDocument()
    expect(
      within(section).queryByRole("button", {
        name: i18n.t("profile.carousel.next", {
          section: i18n.t("profile.sections.credentials"),
        }),
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps carousel indexes valid when the profile data removes the active record", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    const { actions, rerender } = renderReady(snapshot)
    const section = await screen.findByTestId("profile-section-education")
    await user.click(
      within(section).getByRole("button", {
        name: i18n.t("profile.carousel.next", {
          section: i18n.t("profile.sections.education"),
        }),
      }),
    )
    expect(within(section).getByText("Tongji University")).toBeInTheDocument()

    const updatedSnapshot = structuredClone(snapshot)
    updatedSnapshot.profile!.education = updatedSnapshot.profile!.education.slice(0, 1)
    rerender(
      <ProfileView
        actions={actions}
        content={{ status: "ready", data: updatedSnapshot }}
        variant="default"
      />,
    )

    expect(await within(section).findByText("Fudan University")).toBeInTheDocument()
    expect(within(section).queryByText("Tongji University")).not.toBeInTheDocument()
  })

  it("does not render carousel controls for empty summary sections", async () => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.education = []
    snapshot.profile!.credentials = []
    renderReady(snapshot)

    const education = await screen.findByTestId("profile-section-education")
    const credentials = screen.getByTestId("profile-section-credentials")

    expect(within(education).queryByRole("button", { name: /教育经历/ })).not.toBeInTheDocument()
    expect(
      within(credentials).queryByRole("button", { name: /证书与奖项/ }),
    ).not.toBeInTheDocument()
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
    const snapshot: JobProfileSnapshot = structuredClone(profileResponseMock)
    snapshot.resumeUpdate = {
      changeSummary: { changedItems: 2, missingItems: 1, newItems: 1 },
      createdAt: "2026-07-13T08:00:00.000Z",
      failureReason: null,
      id: "resume_update_uploaded",
      preservesManualChanges: true,
      resume: structuredClone(snapshot.profile!.resume!),
      status: "succeeded",
    }
    renderReady(snapshot)

    expect(screen.queryByTestId("profile-resume-update-summary")).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByTestId("profile-resume-update-summary")).toBeInTheDocument()
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
    snapshot.profile!.education[0]!.degree = null
    snapshot.profile!.workExperiences[0]!.location = null
    snapshot.profile!.credentials = []
    snapshot.profile!.projectExperiences = []
    snapshot.profile!.completeness.percentage = 75
    snapshot.profile!.completeness.missingSections = ["projectExperience", "credentials"]
    renderReady(snapshot)
    expect(
      await screen.findByRole("heading", { name: i18n.t("profile.title") }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("progressbar", { name: i18n.t("profile.completeness") }),
    ).toHaveAttribute("aria-valuenow", "75")
    expect(screen.getByText("75%")).toBeInTheDocument()
    expect(screen.queryByText(/待确认/)).not.toBeInTheDocument()
    expect(screen.queryByText("Bachelor of Engineering")).not.toBeInTheDocument()
  })

  it("does not render matching-analysis regeneration controls", async () => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.matchingAnalysisStale = true
    renderReady(snapshot)

    expect(await screen.findByTestId("profile-section-education")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-matching-analysis-stale")).not.toBeInTheDocument()
    expect(screen.queryByText(/重新生成匹配分析/)).not.toBeInTheDocument()
  })

  it("renders long user content verbatim", async () => {
    const snapshot = structuredClone(profileResponseMock)
    const longText = "Long profile content ".repeat(30)
    snapshot.profile!.projectExperiences[0]!.background = longText
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

  it.each(["education", "workExperience", "projectExperience", "skills", "credentials"] as const)(
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
    expect(endDate).toHaveAttribute("type", "month")
    expect(endDate).toHaveValue("2018-06")

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
    expect(restoredEndDate).toHaveAttribute("type", "month")
    expect(restoredEndDate).toHaveValue("")

    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))
    expect(
      await within(dialog).findByText(i18n.t("profile.editor.validation.required")),
    ).toBeInTheDocument()

    await user.type(restoredEndDate, "2010-01")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("profile.editor.save") }))
    expect(
      await within(dialog).findByText(i18n.t("profile.editor.validation.dateRange")),
    ).toBeInTheDocument()
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
    expect(screen.getByTestId("profile-save-success")).toBeInTheDocument()
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
