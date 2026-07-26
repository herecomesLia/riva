import { screen } from "@testing-library/react"
import { useState } from "react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { renderWithProviders } from "@/test/render"

import { BulletListEditor } from "./BulletListEditor"

function StatefulBulletListEditor({ onChange }: { onChange: (items: string[]) => void }) {
  const [items, setItems] = useState(["设计前端架构"])

  return (
    <BulletListEditor
      items={items}
      label="主要职责"
      onChange={(nextItems) => {
        setItems(nextItems)
        onChange(nextItems)
      }}
    />
  )
}

describe("BulletListEditor", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("edits, adds, and deletes individual structured items", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<StatefulBulletListEditor onChange={onChange} />, { router: false })

    await user.clear(screen.getByRole("textbox", { name: "主要职责 1" }))
    await user.type(screen.getByRole("textbox", { name: "主要职责 1" }), "维护组件库")
    expect(onChange).toHaveBeenLastCalledWith(["维护组件库"])

    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.addBullet") }))
    expect(onChange).toHaveBeenLastCalledWith(["维护组件库", ""])

    await user.click(screen.getByRole("button", { name: "删除第 1 项" }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it("does not change items until pasted content is applied", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(
      <BulletListEditor items={["已有要点"]} label="主要职责" onChange={onChange} />,
      { router: false },
    )

    await user.click(
      screen.getByRole("button", { name: i18n.t("profile.editor.pasteAndOrganize") }),
    )
    await user.type(
      screen.getByRole("textbox", { name: i18n.t("profile.editor.pasteContent") }),
      "负责架构设计。维护组件库。推动性能优化。",
    )
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.previewBullets") }))

    expect(screen.getByText("1. 负责架构设计")).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.applyBullets") }))
    expect(onChange).toHaveBeenLastCalledWith([
      "已有要点",
      "负责架构设计",
      "维护组件库",
      "推动性能优化",
    ])
  })
})
