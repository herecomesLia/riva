import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { profileResponseMock } from "@/mocks/data/profile"
import type { SaveProfileSectionInput } from "@/models/profile"
import type { EditableExperienceSection } from "./ProfileSectionEditDialog"
import { renderWithProviders } from "@/test/render"

import { ProfileSectionEditor } from "./ProfileSectionEditor"

function renderEditor(
  section: EditableExperienceSection = "workExperience",
  onSave = vi.fn(async (_input: SaveProfileSectionInput) => {}),
) {
  return {
    onSave,
    ...renderWithProviders(
      <ProfileSectionEditor
        onCancel={vi.fn()}
        onDirtyChange={vi.fn()}
        onSave={onSave}
        profile={structuredClone(profileResponseMock.profile!)}
        section={section}
      />,
      { router: false },
    ),
  }
}

describe("ProfileSectionEditor work experience", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("submits responsibilities, achievements, and skill ids as structured arrays", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor()

    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    const input = onSave.mock.calls[0]![0]
    expect(input.section).toBe("workExperience")
    if (input.section === "workExperience") {
      expect(input.values[0]!.responsibilities).toEqual(
        profileResponseMock.profile!.workExperiences[0]!.responsibilities,
      )
      expect(input.values[0]!.achievements).toEqual(
        profileResponseMock.profile!.workExperiences[0]!.achievements,
      )
      expect(input.values[0]!.skillIds).toEqual(
        profileResponseMock.profile!.workExperiences[0]!.skillIds,
      )
      expect(input.skillsToCreate).toEqual([])
    }
  })

  it("includes a new skill in the same work-experience save", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor()
    const input = screen.getAllByRole("combobox", {
      name: i18n.t("profile.editor.skillInputPlaceholder"),
    })[0]!

    await user.type(input, "Accessibility")
    await user.keyboard("{Enter}")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    const saveInput = onSave.mock.calls[0]![0]
    if (saveInput.section === "workExperience") {
      expect(saveInput.skillsToCreate).toEqual([
        expect.objectContaining({
          clientId: expect.stringMatching(/^draft_skill_/),
          name: "Accessibility",
        }),
      ])
      expect(saveInput.values[0]!.skillIds).toContain(saveInput.skillsToCreate[0]!.clientId)
    }
  })

  it("keeps the draft visible when saving fails", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => {
      throw new Error("save failed")
    })
    renderEditor("workExperience", onSave)

    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await screen.findByText(i18n.t("profile.editor.saveError"))).toBeInTheDocument()
    expect(screen.getByTestId("profile-editor-workExperience")).toBeInTheDocument()
  })
})

describe("ProfileSectionEditor project experience", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("uses project-specific labels and structured project content fields", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor("projectExperience")

    expect(screen.getByLabelText(i18n.t("profile.formField.projectName"))).toBeInTheDocument()
    expect(screen.getByLabelText(i18n.t("profile.formField.projectRole"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.field.projectDescription"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.field.projectAchievements"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.field.technologyStack"))).toBeInTheDocument()
    expect(screen.queryByText("项目背景")).not.toBeInTheDocument()
    expect(screen.queryByText("关键贡献")).not.toBeInTheDocument()
    expect(screen.queryByText("关联工作经历")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    const input = onSave.mock.calls[0]![0]
    expect(input.section).toBe("projectExperience")
    if (input.section === "projectExperience") {
      expect(input.values[0]!.responsibilities).toEqual(
        profileResponseMock.profile!.projectExperiences[0]!.responsibilities,
      )
      expect(input.values[0]!.achievements).toEqual(
        profileResponseMock.profile!.projectExperiences[0]!.achievements,
      )
      expect(input.values[0]!.technologyStack).toEqual(
        profileResponseMock.profile!.projectExperiences[0]!.technologyStack,
      )
      expect("skillsToCreate" in input).toBe(false)
    }
  })

  it("includes a new technology in the same project save", async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor("projectExperience")
    const input = screen.getByRole("textbox", {
      name: i18n.t("profile.editor.technologyInputPlaceholder"),
    })

    await user.type(input, "Accessibility")
    await user.keyboard("{Enter}")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    const saveInput = onSave.mock.calls[0]![0]
    if (saveInput.section === "projectExperience") {
      expect(saveInput.values[0]!.technologyStack).toContain("Accessibility")
      expect("skillsToCreate" in saveInput).toBe(false)
    }
  })
})
