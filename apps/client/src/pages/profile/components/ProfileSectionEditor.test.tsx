import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { UpdateCareerProfileRequest } from "@/api/generated/models"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { renderWithProviders } from "@/test/render"

import type { EditableExperienceSection } from "./ProfileSectionEditDialog"
import { ProfileSectionEditor } from "./ProfileSectionEditor"

function renderEditor(
  section: EditableExperienceSection = "workExperience",
  onSave = vi.fn(async (_input: UpdateCareerProfileRequest) => {}),
) {
  return {
    onSave,
    ...renderWithProviders(
      <ProfileSectionEditor
        onCancel={vi.fn()}
        onDirtyChange={vi.fn()}
        onSave={onSave}
        profile={structuredClone(careerProfileFixture)}
        section={section}
      />,
      { router: false },
    ),
  }
}

describe("ProfileSectionEditor", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it.each(["education", "workExperience", "projectExperience"] as const)(
    "uses client-only identity for %s drafts",
    (section) => {
      renderEditor(section)
      const item = screen.getByTestId(/^profile-editor-item-/)
      expect(item).toHaveAttribute("role", "group")
      expect(item.dataset.testid).toMatch(/^profile-editor-item-draft_/)
    },
  )

  it("submits work fields and adds a new referenced skill to the top level", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor()
    const input = screen.getByRole("combobox", {
      name: i18n.t("profile.editor.skillInputPlaceholder"),
    })

    await user.type(input, "Accessibility")
    await user.keyboard("{Enter}")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      skills: [...careerProfileFixture.skills, "Accessibility"],
      workExperiences: [
        {
          ...careerProfileFixture.workExperiences[0],
          skills: [...careerProfileFixture.workExperiences[0]!.skills, "Accessibility"],
        },
      ],
    })
  })

  it("maps null endDate to the present draft and strips draft fields on save", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor("education")

    expect(
      screen.getByRole("checkbox", { name: i18n.t("profile.field.present") }),
    ).not.toBeChecked()
    await user.click(screen.getByRole("checkbox", { name: i18n.t("profile.field.present") }))
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      education: [{ ...careerProfileFixture.education[0], endDate: null }],
    })
    expect(onSave.mock.calls[0]![0].education?.[0]).not.toHaveProperty("clientId")
    expect(onSave.mock.calls[0]![0].education?.[0]).not.toHaveProperty("isCurrent")
  })

  it("submits project fields using the generated request names", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor("projectExperience")

    expect(screen.getByText(i18n.t("profile.field.projectDescription"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.field.techStack"))).toBeInTheDocument()
    expect(screen.getByLabelText(i18n.t("profile.formField.url"))).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({ projects: careerProfileFixture.projects })
  })

  it.each([
    ["workExperience", 4],
    ["projectExperience", 3],
  ] as const)("shows every missing required field for a new %s", async (section, errorCount) => {
    const user = userEvent.setup()
    const { onSave } = renderEditor(section)

    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.addExperience") }))
    const newItem = screen.getAllByTestId(/^profile-editor-item-/).at(-1)
    expect(newItem).toBeDefined()

    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => {
      expect(
        within(newItem!).getAllByText(i18n.t("profile.editor.validation.required")),
      ).toHaveLength(errorCount)
    })
    expect(onSave).not.toHaveBeenCalled()
  })

  it("keeps a failed save draft visible and hides the raw failure", async () => {
    const user = userEvent.setup()
    renderEditor(
      "workExperience",
      vi.fn(async () => {
        throw new Error("private failure")
      }),
    )

    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await screen.findByText(i18n.t("profile.editor.saveError"))).toBeInTheDocument()
    expect(screen.getByTestId("profile-editor-workExperience")).toBeInTheDocument()
    expect(screen.queryByText("private failure")).not.toBeInTheDocument()
  })
})
