import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { renderWithProviders } from "@/test/render"

import { SkillTagInput } from "./SkillTagInput"

function StatefulSkillTagInput({ onChange }: { onChange: (skills: string[]) => void }) {
  const [skills, setSkills] = useState<string[]>([])
  return (
    <SkillTagInput
      availableSkills={["React", "TypeScript"]}
      description="Select or enter a skill."
      label="Related skills"
      onSelectedSkillsChange={(next) => {
        setSkills(next)
        onChange(next)
      }}
      selectedSkills={skills}
    />
  )
}

describe("SkillTagInput", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("adds an existing skill by its canonical name", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<StatefulSkillTagInput onChange={onChange} />, { router: false })
    const input = screen.getByRole("combobox", {
      name: i18n.t("profile.editor.skillInputPlaceholder"),
    })

    await user.type(input, "react")
    await user.keyboard("{Enter}")

    expect(onChange).toHaveBeenCalledWith(["React"])
    expect(screen.getByText("React")).toBeInTheDocument()
  })

  it("adds a new skill directly and keeps it on Backspace", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<StatefulSkillTagInput onChange={onChange} />, { router: false })
    const input = screen.getByRole("combobox", {
      name: i18n.t("profile.editor.skillInputPlaceholder"),
    })

    await user.type(input, "Accessibility")
    await user.keyboard("{Enter}")

    expect(onChange).toHaveBeenCalledWith(["Accessibility"])
    await user.keyboard("{Backspace}")
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByText("Accessibility")).toBeInTheDocument()
  })

  it("reports a duplicate without changing selected skills", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(
      <SkillTagInput
        availableSkills={["React", "TypeScript"]}
        description="Select or enter a skill."
        label="Related skills"
        onSelectedSkillsChange={onChange}
        selectedSkills={["React"]}
      />,
      { router: false },
    )
    const input = screen.getByRole("combobox", {
      name: i18n.t("profile.editor.skillInputPlaceholder"),
    })

    await user.type(input, " react ")
    await user.keyboard("{Enter}")

    expect(screen.getByRole("alert")).toHaveTextContent(
      i18n.t("profile.editor.validation.duplicateSkill"),
    )
    expect(onChange).not.toHaveBeenCalled()
  })
})
