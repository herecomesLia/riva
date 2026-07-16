import { screen } from "@testing-library/react"
import { useState } from "react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { profileResponseMock } from "@/mocks/data/profile"
import { renderWithProviders } from "@/test/render"

import { SkillTagInput } from "./SkillTagInput"

function StatefulSkillTagInput({
  onDraftSkillsChange,
  onSelectedSkillIdsChange,
}: {
  onDraftSkillsChange: (skills: unknown[]) => void
  onSelectedSkillIdsChange: (ids: string[]) => void
}) {
  const [draftSkills, setDraftSkills] = useState<
    Array<{ id: string; name: string; source: "userAdded" }>
  >([])
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])

  return (
    <SkillTagInput
      availableSkills={[]}
      draftSkills={draftSkills}
      onDraftSkillsChange={(skills) => {
        setDraftSkills(skills)
        onDraftSkillsChange(skills)
      }}
      onSelectedSkillIdsChange={(ids) => {
        setSelectedSkillIds(ids)
        onSelectedSkillIdsChange(ids)
      }}
      selectedSkillIds={selectedSkillIds}
    />
  )
}

describe("SkillTagInput", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("adds existing skills by name and never exposes their ids", async () => {
    const user = userEvent.setup()
    const onSelectedSkillIdsChange = vi.fn()
    renderWithProviders(
      <SkillTagInput
        availableSkills={profileResponseMock.profile!.skills}
        draftSkills={[]}
        onDraftSkillsChange={vi.fn()}
        onSelectedSkillIdsChange={onSelectedSkillIdsChange}
        selectedSkillIds={[]}
      />,
      { router: false },
    )

    await user.type(
      screen.getByRole("combobox", { name: i18n.t("profile.editor.skillInputPlaceholder") }),
      "React",
    )
    await user.keyboard("{Enter}")

    expect(onSelectedSkillIdsChange).toHaveBeenCalledWith(["skill_react"])
    expect(screen.queryByText("skill_react")).not.toBeInTheDocument()
  })

  it("creates one reusable temporary skill and removes the last tag with Backspace", async () => {
    const user = userEvent.setup()
    const onDraftSkillsChange = vi.fn()
    const onSelectedSkillIdsChange = vi.fn()
    renderWithProviders(
      <StatefulSkillTagInput
        onDraftSkillsChange={onDraftSkillsChange}
        onSelectedSkillIdsChange={onSelectedSkillIdsChange}
      />,
      { router: false },
    )

    const input = screen.getByRole("combobox", {
      name: i18n.t("profile.editor.skillInputPlaceholder"),
    })
    await user.type(input, "Accessibility")
    await user.keyboard("{Enter}")

    expect(onDraftSkillsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.stringMatching(/^draft_skill_/),
        name: "Accessibility",
      }),
    ])
    expect(onSelectedSkillIdsChange).toHaveBeenCalledWith([expect.stringMatching(/^draft_skill_/)])

    await user.keyboard("{Backspace}")
    expect(onSelectedSkillIdsChange).toHaveBeenLastCalledWith([])
  })
})
