import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { completeMockInterviewHistoryStoryFixture } from "@/pages/history/stories/mock-interview-history-story-fixtures"
import { renderWithProviders } from "@/test/render"

import { HistoryReferenceAnswer } from "./HistoryReferenceAnswer"

describe("HistoryReferenceAnswer", () => {
  it("lets a ready example answer use the full CardContent width", () => {
    const referenceAnswer = completeMockInterviewHistoryStoryFixture.questions[0].referenceAnswer
    if (referenceAnswer.status !== "ready") throw new Error("Ready reference fixture required.")

    renderWithProviders(<HistoryReferenceAnswer referenceAnswer={referenceAnswer} />, {
      router: false,
    })

    const exampleAnswer = screen.getByText(referenceAnswer.content.exampleAnswer)
    expect(exampleAnswer).toHaveClass("w-full", "min-w-0")
    expect(exampleAnswer).not.toHaveClass("max-w-prose")
    expect(exampleAnswer.closest("section")).toHaveClass("min-w-0")
  })

  it("generates in place without rendering a training navigation link", async () => {
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
    expect(button).not.toHaveAttribute("href")
    await user.click(button)
    expect(onGenerate).toHaveBeenCalledOnce()
  })

  it("locks duplicate clicks while a request is pending or generation is active", async () => {
    const onGenerate = vi.fn()
    const { rerender } = renderWithProviders(
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

    rerender(
      <HistoryReferenceAnswer
        onGenerate={onGenerate}
        referenceAnswer={{ status: "generating", content: null }}
      />,
    )
    expect(
      screen.getByRole("button", { name: i18n.t("history.detail.reference.generate") }),
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

  it("distinguishes a transient polling retry from a terminal polling failure", async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()
    const { rerender } = renderWithProviders(
      <HistoryReferenceAnswer
        onGenerate={onGenerate}
        referenceAnswer={{ status: "pollingRetrying", content: null }}
      />,
      { router: false },
    )

    expect(screen.getByTestId("history-reference-pollingRetrying")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("history.detail.reference.generate") }),
    ).toBeDisabled()

    rerender(
      <HistoryReferenceAnswer
        onGenerate={onGenerate}
        referenceAnswer={{
          status: "pollingFailed",
          content: null,
          reason: "consecutiveFailures",
        }}
      />,
    )
    const recheck = screen.getByRole("button", {
      name: i18n.t("history.detail.reference.recheck"),
    })
    expect(recheck).toBeEnabled()
    await user.click(recheck)
    expect(onGenerate).toHaveBeenCalledOnce()
  })
})
