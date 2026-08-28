import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { renderWithProviders } from "@/test/render"

import { TechnologyStackInput } from "./TechnologyStackInput"

function StatefulTechnologyStackInput({ onChange }: { onChange: (values: string[]) => void }) {
  const [technologies, setTechnologies] = useState(["React"])

  return (
    <TechnologyStackInput
      description="Project-specific technologies"
      label="Technology stack"
      onChange={(values) => {
        setTechnologies(values)
        onChange(values)
      }}
      technologies={technologies}
    />
  )
}

describe("TechnologyStackInput", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("adds normalized project-local technologies without creating skill ids", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<StatefulTechnologyStackInput onChange={onChange} />, { router: false })

    const input = screen.getByRole("textbox", {
      name: i18n.t("profile.editor.technologyInputPlaceholder"),
    })
    await user.type(input, " TypeScript, typescript；Rust ")
    await user.keyboard("{Enter}")

    expect(onChange).toHaveBeenLastCalledWith(["React", "TypeScript", "Rust"])
    expect(screen.getByText("TypeScript")).toBeInTheDocument()
    expect(screen.getByText("Rust")).toBeInTheDocument()
  })

  it("uses the same editable badge and remove-button styling as related skills", () => {
    renderWithProviders(<StatefulTechnologyStackInput onChange={vi.fn()} />, { router: false })

    const badge = screen.getByText("React").closest('[data-slot="badge"]')
    const removeButton = screen.getByRole("button", {
      name: i18n.t("profile.editor.removeTechnology", { name: "React" }),
    })

    expect(badge).toHaveClass("h-7", "bg-sky-100", "text-primary", "dark:bg-sky-950")
    expect(removeButton).toHaveClass("-mr-1", "size-4", "rounded-full", "p-0")
  })

  it("does not remove the last technology with Backspace when the input is empty", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<StatefulTechnologyStackInput onChange={onChange} />, { router: false })

    await user.click(
      screen.getByRole("textbox", {
        name: i18n.t("profile.editor.technologyInputPlaceholder"),
      }),
    )
    await user.keyboard("{Backspace}")

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText("React")).toBeInTheDocument()
  })
})
