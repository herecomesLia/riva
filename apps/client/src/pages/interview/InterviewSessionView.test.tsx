import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { renderWithProviders } from "@/test/render"

import { InterviewSessionView, type InterviewSessionViewProps } from "./InterviewSessionView"

const summary = {
  targetRole: "高级前端工程师",
  company: "字节跳动",
  round: "technical",
  difficulty: "pressure",
  completedQuestions: 0,
  totalQuestions: 3,
} as const

function questionProps(
  onSubmit: (content: string) => Promise<void> = vi.fn(async () => undefined),
): Extract<InterviewSessionViewProps, { status: "question" }> {
  return {
    status: "question",
    summary,
    prompt: {
      id: "question-1",
      kind: "question",
      content: "请先做一个简短的自我介绍。",
      questionOrder: 1,
      answer: null,
    },
    isSubmitting: false,
    advanceStatus: "idle",
    isEnding: false,
    isInteractionLocked: false,
    onSubmit,
    onRetryAdvance: vi.fn(),
    onEnd: vi.fn(async () => undefined),
  }
}

describe("InterviewSessionView", () => {
  it("keeps the session structure visible while loading", () => {
    renderWithProviders(<InterviewSessionView status="loading" />, { router: false })

    expect(
      screen.getByRole("heading", { name: i18n.t("interview.session.title") }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("interview-session-loading")).toHaveAttribute("aria-busy", "true")
  })

  it("submits with the keyboard shortcut", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => undefined)
    renderWithProviders(<InterviewSessionView {...questionProps(onSubmit)} />, {
      router: false,
    })

    const textbox = screen.getByRole("textbox", {
      name: i18n.t("interview.session.answer.label"),
    })
    await user.type(textbox, "我有五年前端开发经验。")
    await user.keyboard("{Control>}{Enter}{/Control}")

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("我有五年前端开发经验。"))
  })

  it("preserves a long answer after submission fails", async () => {
    const user = userEvent.setup()
    const answer = "我先定位关键链路，再协调上下游分阶段灰度，并持续观察核心业务指标。".repeat(8)
    const onSubmit = vi.fn(async () => {
      throw new Error("submit failed")
    })
    renderWithProviders(<InterviewSessionView {...questionProps(onSubmit)} />, {
      router: false,
    })

    const textbox = screen.getByRole("textbox")
    await user.type(textbox, answer)
    await user.click(
      screen.getByRole("button", { name: i18n.t("interview.session.answer.submit") }),
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("interview.session.errors.submitTitle"),
    )
    expect(textbox).toHaveValue(answer)
  })

  it("requires confirmation before ending an active interview", async () => {
    const user = userEvent.setup()
    const onEnd = vi.fn(async () => undefined)
    renderWithProviders(
      <InterviewSessionView
        beginFailed={false}
        isBeginning={false}
        isEnding={false}
        isInteractionLocked={false}
        onBegin={vi.fn(async () => undefined)}
        onEnd={onEnd}
        openingMessage="欢迎参加本次模拟面试。"
        status="opening"
        summary={summary}
      />,
      { router: false },
    )

    await user.click(screen.getByRole("button", { name: i18n.t("interview.session.actions.end") }))
    expect(onEnd).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: i18n.t("interview.session.actions.confirmEnd") }),
    )
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it("does not expose per-question scoring or reference-answer actions", () => {
    renderWithProviders(<InterviewSessionView {...questionProps()} />, { router: false })

    expect(screen.queryByText(/逐题评分|per-question score/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /参考答案|sample answer/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /收藏|save/i })).not.toBeInTheDocument()
  })
})
