import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { renderWithProviders } from "@/test/render"

import { HistoryReferenceAnswer } from "./HistoryReferenceAnswer"

describe("HistoryReferenceAnswer", () => {
  it("requests generation from the not-requested state", async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()
    renderWithProviders(
      <HistoryReferenceAnswer
        onGenerate={onGenerate}
        referenceAnswer={{ status: "notRequested", content: null }}
      />,
      { router: false },
    )

    const button = screen.getByRole("button", {
      name: i18n.t("history.detail.reference.generate"),
    })
    await user.click(button)
    expect(onGenerate).toHaveBeenCalledOnce()
  })

  it("locks duplicate clicks while a request is pending", () => {
    const onGenerate = vi.fn()
    renderWithProviders(
      <HistoryReferenceAnswer
        isRequesting
        onGenerate={onGenerate}
        referenceAnswer={{ status: "notRequested", content: null }}
      />,
      { router: false },
    )

    expect(
      screen.getByRole("button", { name: i18n.t("history.detail.reference.requesting") }),
    ).toBeDisabled()
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it("allows generationFailed retries but hides retry for insufficientContext", () => {
    const onGenerate = vi.fn()
    const { rerender } = renderWithProviders(
      <HistoryReferenceAnswer
        onGenerate={onGenerate}
        referenceAnswer={{
          status: "unavailable",
          content: null,
          reason: "generationFailed",
        }}
      />,
      { router: false },
    )
    expect(
      screen.getByRole("button", { name: i18n.t("history.detail.reference.generate") }),
    ).toBeEnabled()

    rerender(
      <HistoryReferenceAnswer
        onGenerate={onGenerate}
        referenceAnswer={{
          status: "unavailable",
          content: null,
          reason: "insufficientContext",
        }}
      />,
    )
    expect(
      screen.queryByRole("button", { name: i18n.t("history.detail.reference.generate") }),
    ).not.toBeInTheDocument()
  })
})
