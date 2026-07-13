import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createProfileMockSnapshot } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"
import { ProfilePage } from "@/pages/profile"
import { getJobProfile, saveProfileSection } from "@/services/profile"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/profile", () => ({
  getJobProfile: vi.fn(),
  saveProfileSection: vi.fn(),
}))

function renderProfilePage() {
  return renderWithProviders(<ProfilePage />, { router: { initialEntries: ["/profile"] } })
}

function setUpEditableProfile() {
  const snapshot = createProfileMockSnapshot("complete")
  const profile = snapshot.profile!

  vi.mocked(getJobProfile).mockResolvedValue(snapshot)
  vi.mocked(saveProfileSection).mockImplementation(async (input) => {
    const nextProfile = structuredClone(profile)

    if (input.section === "basicInformation") nextProfile.basicInformation = input.values
    if (input.section === "education") nextProfile.education = input.values
    if (input.section === "workExperience") nextProfile.workExperiences = input.values
    if (input.section === "projectExperience") nextProfile.projectExperiences = input.values
    if (input.section === "skills") nextProfile.skills = input.values
    if (input.section === "credentials") nextProfile.credentials = input.values
    if (input.section === "careerDirection") nextProfile.careerDirection = input.values

    return nextProfile
  })

  return { profile, snapshot }
}

describe("ProfilePage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getJobProfile).mockReset()
    vi.mocked(saveProfileSection).mockReset()
  })

  it("renders an empty state when no profile exists", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("notCreated"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-empty-state")).toHaveTextContent(
      i18n.t("profile.empty.title"),
    )
    expect(screen.queryByText("Lin Chen")).not.toBeInTheDocument()
  })

  it("renders the recognition-in-progress state without structured profile sections", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("parsing"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-processing-state")).toHaveTextContent(
      i18n.t("profile.lifecycle.parsing.title"),
    )
    expect(
      screen.queryByRole("heading", { name: i18n.t("profile.sections.workExperience") }),
    ).not.toBeInTheDocument()
  })

  it("renders the recognition failure returned by the service", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("recognitionFailed"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-recognition-failure")).toHaveTextContent(
      "The document could not be parsed.",
    )
  })

  it("renders the main structured profile content in the complete state", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("complete"))

    renderProfilePage()

    expect(
      await screen.findByRole("heading", { name: i18n.t("profile.title") }),
    ).toBeInTheDocument()
    expect(screen.getByText("lin-chen-resume.pdf")).toBeInTheDocument()
    expect(screen.getByText("Lin Chen")).toBeInTheDocument()
    expect(screen.getAllByText("Senior Frontend Engineer").length).toBeGreaterThan(0)
    expect(screen.getByText("Merchant Operations Console")).toBeInTheDocument()
    expect(screen.getByText("AWS Certified Cloud Practitioner")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("profile.actions.viewTargetRoles") }),
    ).toHaveAttribute("href", "/roles")
  })

  it("shows a lightweight confirmation notice for recognized information that needs review", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("awaitingConfirmation"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-review-notice")).toHaveTextContent(
      i18n.t("profile.lifecycle.awaitingConfirmation.title"),
    )
    expect(screen.getAllByText(i18n.t("profile.reviewStatus.needsReview")).length).toBeGreaterThan(
      0,
    )
  })

  it("warns when matching analysis is stale", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("matchingAnalysisStale"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-matching-analysis-stale")).toHaveTextContent(
      i18n.t("profile.matchingAnalysis.staleTitle"),
    )
  })

  it("keeps rendering when optional sections and basic fields are missing", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("incomplete"))

    renderProfilePage()

    expect(
      await screen.findByRole("heading", { name: i18n.t("profile.sections.education") }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(i18n.t("profile.emptySection")).length).toBeGreaterThan(0)
    expect(screen.queryByText("+86 138 0000 1234")).not.toBeInTheDocument()
  })

  it("renders a retryable page error without exposing the raw service error", async () => {
    vi.mocked(getJobProfile).mockRejectedValue(new Error("raw profile service failure"))

    renderProfilePage()

    const alert = await screen.findByRole("alert")

    expect(alert).toHaveTextContent(i18n.t("common.pageState.error.title"))
    expect(alert).not.toHaveTextContent("raw profile service failure")
  })

  it("requires a decision before switching a dirty section and can discard its draft", async () => {
    const user = userEvent.setup()
    setUpEditableProfile()
    renderProfilePage()

    const basicSection = await screen.findByTestId("profile-section-basicInformation")
    await user.click(
      within(basicSection).getByRole("button", { name: i18n.t("profile.actions.edit") }),
    )

    const editor = screen.getByTestId("profile-editor-basicInformation")
    expect(editor).toBeInTheDocument()
    const name = within(editor).getByLabelText(i18n.t("profile.field.name"))
    await user.clear(name)
    await user.type(name, "Draft name")
    await user.click(
      within(screen.getByTestId("profile-section-workExperience")).getByRole("button", {
        name: i18n.t("profile.actions.edit"),
      }),
    )
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      i18n.t("profile.dialog.discardDraftTitle"),
    )
    await user.click(screen.getByRole("button", { name: i18n.t("profile.dialog.stayEditing") }))
    await user.click(
      within(screen.getByTestId("profile-section-workExperience")).getByRole("button", {
        name: i18n.t("profile.actions.edit"),
      }),
    )
    await user.click(
      screen.getByRole("button", { name: i18n.t("profile.dialog.discardAndContinue") }),
    )

    expect(await screen.findByTestId("profile-editor-workExperience")).toBeInTheDocument()
    expect(screen.queryByText("Draft name")).not.toBeInTheDocument()
  })

  it("provides the same draft editor framework for education and project sections", async () => {
    const user = userEvent.setup()
    setUpEditableProfile()
    renderProfilePage()

    for (const section of ["education", "projectExperience"] as const) {
      const readonlySection = await screen.findByTestId(`profile-section-${section}`)
      await user.click(
        within(readonlySection).getByRole("button", { name: i18n.t("profile.actions.edit") }),
      )

      const editor = screen.getByTestId(`profile-editor-${section}`)
      expect(
        within(editor).getByRole("button", { name: i18n.t("profile.editor.addExperience") }),
      ).toBeInTheDocument()
      await user.click(
        within(editor).getByRole("button", { name: i18n.t("profile.editor.cancel") }),
      )
    }
  })

  it("saves a changed work section and updates the rendered query data", async () => {
    const user = userEvent.setup()
    setUpEditableProfile()
    renderProfilePage()

    const section = await screen.findByTestId("profile-section-workExperience")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))

    const editor = screen.getByTestId("profile-editor-workExperience")
    const company = within(editor).getAllByLabelText(i18n.t("profile.formField.company"))[0]
    await user.clear(company)
    await user.type(company, "Updated Commerce")
    await user.click(within(editor).getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => {
      expect(saveProfileSection).toHaveBeenCalled()
    })
    expect(vi.mocked(saveProfileSection).mock.calls[0][0]).toEqual(
      expect.objectContaining({ section: "workExperience" }),
    )
    expect(await screen.findByText("Updated Commerce")).toBeInTheDocument()
  })

  it("adds and removes list entries only inside the draft, then restores them on cancel", async () => {
    const user = userEvent.setup()
    const { profile } = setUpEditableProfile()
    renderProfilePage()

    const section = await screen.findByTestId("profile-section-workExperience")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const editor = screen.getByTestId("profile-editor-workExperience")

    expect(
      within(editor).getByTestId(`profile-editor-item-${profile.workExperiences[0].id}`),
    ).toBeInTheDocument()
    await user.click(
      within(editor).getByRole("button", { name: i18n.t("profile.editor.addExperience") }),
    )
    expect(within(editor).getAllByText(i18n.t("profile.editor.delete"))).toHaveLength(3)

    await user.click(
      within(editor).getAllByRole("button", { name: i18n.t("profile.editor.delete") })[0],
    )
    expect(
      within(editor).queryByTestId(`profile-editor-item-${profile.workExperiences[0].id}`),
    ).not.toBeInTheDocument()

    await user.click(within(editor).getByRole("button", { name: i18n.t("profile.editor.cancel") }))
    expect(await screen.findByText("Northstar Commerce")).toBeInTheDocument()
    expect(profile.workExperiences).toHaveLength(2)
  })

  it("submits added and deleted entries as one stable-ID section update", async () => {
    const user = userEvent.setup()
    const { profile } = setUpEditableProfile()
    renderProfilePage()

    const section = await screen.findByTestId("profile-section-workExperience")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const editor = screen.getByTestId("profile-editor-workExperience")
    await user.click(
      within(editor).getByRole("button", { name: i18n.t("profile.editor.addExperience") }),
    )
    await user.click(
      within(editor).getAllByRole("button", { name: i18n.t("profile.editor.delete") })[1],
    )

    const companies = within(editor).getAllByLabelText(i18n.t("profile.formField.company"))
    const titles = within(editor).getAllByLabelText(i18n.t("profile.formField.title"))
    const startDates = within(editor).getAllByLabelText(i18n.t("profile.formField.startDate"))
    await user.type(companies[1], "New Studio")
    await user.type(titles[1], "Engineer")
    fireEvent.change(startDates[1], { target: { value: "2025-01" } })
    await user.click(within(editor).getAllByRole("checkbox")[1])
    await user.click(within(editor).getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(saveProfileSection).toHaveBeenCalledTimes(1))
    const input = vi.mocked(saveProfileSection).mock.calls[0][0]
    expect(input.section).toBe("workExperience")
    if (input.section === "workExperience") {
      expect(input.values.map((item) => item.id)).toEqual([
        profile.workExperiences[0].id,
        expect.stringMatching(/^draft_/),
      ])
      expect(input.values.map((item) => item.id)).not.toContain("1")
    }
  })

  it("keeps user input after a save failure and does not mutate the fixture", async () => {
    const user = userEvent.setup()
    const { profile } = setUpEditableProfile()
    vi.mocked(saveProfileSection).mockRejectedValueOnce(new Error("save failed"))
    renderProfilePage()

    const section = await screen.findByTestId("profile-section-workExperience")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const editor = screen.getByTestId("profile-editor-workExperience")
    const company = within(editor).getAllByLabelText(i18n.t("profile.formField.company"))[0]
    await user.clear(company)
    await user.type(company, "Retained draft")
    await user.click(within(editor).getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await screen.findByText(i18n.t("profile.editor.saveError"))).toBeInTheDocument()
    expect(company).toHaveValue("Retained draft")
    expect(profile.workExperiences[0].company).toBe("Northstar Commerce")
  })

  it("adds and deletes skills in a draft, and rejects duplicate skill names", async () => {
    const user = userEvent.setup()
    setUpEditableProfile()
    renderProfilePage()

    const section = await screen.findByTestId("profile-section-skills")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const editor = screen.getByTestId("profile-editor-skills")
    const initialSkillCount = within(editor).getAllByLabelText(
      i18n.t("profile.field.skillName"),
    ).length
    await user.click(
      within(editor).getByRole("button", { name: i18n.t("profile.editor.addSkill") }),
    )
    expect(within(editor).getAllByLabelText(i18n.t("profile.field.skillName"))).toHaveLength(
      initialSkillCount + 1,
    )

    const skillNames = within(editor).getAllByLabelText(i18n.t("profile.field.skillName"))
    await user.type(skillNames.at(-1)!, "React")
    await user.click(within(editor).getByRole("button", { name: i18n.t("profile.editor.save") }))
    expect(
      await screen.findByText(i18n.t("profile.editor.validation.duplicateSkill")),
    ).toBeInTheDocument()

    await user.click(
      within(editor)
        .getAllByRole("button", { name: i18n.t("profile.editor.delete") })
        .at(-1)!,
    )
    expect(within(editor).getAllByLabelText(i18n.t("profile.field.skillName"))).toHaveLength(
      initialSkillCount,
    )
  })

  it("edits credentials and submits additions and removals as one section", async () => {
    const user = userEvent.setup()
    setUpEditableProfile()
    renderProfilePage()

    const section = await screen.findByTestId("profile-section-credentials")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const editor = screen.getByTestId("profile-editor-credentials")
    const names = within(editor).getAllByLabelText(i18n.t("profile.field.name"))
    await user.clear(names[0])
    await user.type(names[0], "Updated AWS certification")
    await user.click(
      within(editor).getByRole("button", { name: i18n.t("profile.editor.addCredential") }),
    )
    expect(within(editor).getAllByLabelText(i18n.t("profile.field.name"))).toHaveLength(3)
    await user.click(
      within(editor)
        .getAllByRole("button", { name: i18n.t("profile.editor.delete") })
        .at(-1)!,
    )
    await user.click(within(editor).getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(saveProfileSection).toHaveBeenCalled())
    const input = vi.mocked(saveProfileSection).mock.calls[0][0]
    expect(input.section).toBe("credentials")
    if (input.section === "credentials") {
      expect(input.values).toHaveLength(2)
      expect(input.values[0].name).toBe("Updated AWS certification")
    }
  })

  it("saves the career direction draft and clears its dirty state", async () => {
    const user = userEvent.setup()
    setUpEditableProfile()
    renderProfilePage()

    const section = await screen.findByTestId("profile-section-careerDirection")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const editor = screen.getByTestId("profile-editor-careerDirection")
    const industries = within(editor).getByLabelText(i18n.t("profile.field.desiredIndustries"))
    await user.clear(industries)
    await user.type(industries, "Developer tools")
    await user.click(within(editor).getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await screen.findByTestId("profile-save-success")).toHaveTextContent(
      i18n.t("profile.editor.saveSuccess"),
    )
    expect(saveProfileSection).toHaveBeenCalled()
    await user.click(
      within(screen.getByTestId("profile-section-skills")).getByRole("button", {
        name: i18n.t("profile.actions.edit"),
      }),
    )
    expect(screen.queryByText(i18n.t("profile.dialog.discardDraftTitle"))).not.toBeInTheDocument()
  })

  it("blocks in-app navigation while a dirty draft is open", async () => {
    const user = userEvent.setup()
    setUpEditableProfile()
    renderProfilePage()

    const section = await screen.findByTestId("profile-section-skills")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const editor = screen.getByTestId("profile-editor-skills")
    await user.clear(within(editor).getAllByLabelText(i18n.t("profile.field.skillName"))[0])
    await user.type(
      within(editor).getAllByLabelText(i18n.t("profile.field.skillName"))[0],
      "Changed React",
    )
    await user.click(
      screen.getByRole("button", { name: i18n.t("profile.actions.viewTargetRoles") }),
    )

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      i18n.t("profile.dialog.leavePageTitle"),
    )
  })

  it("prevents duplicate saves while saving and shows success once the request resolves", async () => {
    const user = userEvent.setup()
    const { profile } = setUpEditableProfile()
    let resolveSave: ((profile: JobProfile) => void) | undefined
    vi.mocked(saveProfileSection).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        }),
    )
    renderProfilePage()

    const section = await screen.findByTestId("profile-section-skills")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    const editor = screen.getByTestId("profile-editor-skills")
    const firstSkill = within(editor).getAllByLabelText(i18n.t("profile.field.skillName"))[0]
    await user.clear(firstSkill)
    await user.type(firstSkill, "React updated")
    const save = within(editor).getByRole("button", { name: i18n.t("profile.editor.save") })
    await user.click(save)
    await user.click(save)

    expect(saveProfileSection).toHaveBeenCalledTimes(1)
    expect(save).toBeDisabled()
    resolveSave?.(profile)
    expect(await screen.findByTestId("profile-save-success")).toBeInTheDocument()
  })
})
