import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { createCandidateExchangeStoryFixture } from "./stories/interview-story-fixtures"
import { renderWithProviders } from "@/test/render"

import { InterviewSessionView, type InterviewSessionViewProps } from "./InterviewSessionView"

const summary = {
  role: "高级前端工程师",
  company: "字节跳动",
  round: "technical",
  difficulty: "pressure",
  completedMainQuestions: 0,
  totalMainQuestions: 3,
  planAdjusted: false,
} as const

function questionProps(
  onSubmit: (content: string) => Promise<void> = vi.fn(async () => undefined),
): Extract<InterviewSessionViewProps, { status: "question" }> {
  return {
    status: "question",
    summary,
    prompt: {
      kind: "question",
      content: "请先做一个简短的自我介绍。",
      questionOrder: 1,
    },
    history: [],
    isSubmitting: false,
    isEnding: false,
    isInteractionLocked: false,
    onSubmit,
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

  it("shows non-misleading progress when the Agent has not fixed a total", () => {
    renderWithProviders(
      <InterviewSessionView
        {...questionProps()}
        summary={{ ...summary, completedMainQuestions: 2, totalMainQuestions: null }}
      />,
      { router: false },
    )

    expect(
      screen.getByText(
        i18n.t("interview.session.progressUnknown", {
          completed: 2,
        }),
      ),
    ).toBeVisible()
    expect(
      screen.getByText(i18n.t("interview.session.questionPositionUnknown", { current: 1 })),
    ).toBeVisible()
    expect(screen.queryByText(/1\s*\/\s*3/)).not.toBeInTheDocument()
  })

  it("marks a server-reported plan revision and displays its revised total", () => {
    renderWithProviders(
      <InterviewSessionView
        {...questionProps()}
        summary={{
          ...summary,
          completedMainQuestions: 1,
          totalMainQuestions: 4,
          planAdjusted: true,
        }}
      />,
      { router: false },
    )

    expect(screen.getByText(i18n.t("interview.session.planAdjusted"))).toBeVisible()
    expect(
      screen.getByText(
        i18n.t("interview.session.progress", {
          completed: 1,
          total: 4,
        }),
      ),
    ).toBeVisible()
  })

  it("distinguishes follow-ups in the unified conversation history", () => {
    renderWithProviders(
      <InterviewSessionView
        {...questionProps()}
        history={[
          {
            kind: "question",
            questionOrder: 2,
            prompt: "请介绍一次性能优化。",
            answer: "我先定位长任务，再分阶段完成治理。",
          },
          {
            kind: "followUp",
            questionOrder: 2,
            prompt: "你如何证明业务收益？",
            answer: "我使用灰度分组进行同期对照。",
          },
        ]}
      />,
      { router: false },
    )

    expect(screen.getAllByText(i18n.t("interview.session.promptKinds.question"))).toHaveLength(2)
    expect(screen.getByText(i18n.t("interview.session.promptKinds.followUp"))).toBeVisible()
    expect(
      screen.getAllByText(i18n.t("interview.session.history.questionNumber", { current: 2 })),
    ).toHaveLength(2)
  })

  it("preserves a candidate question when submission fails", async () => {
    const user = userEvent.setup()
    const question = "这个岗位入职六个月后的成功标准是什么？"
    renderWithProviders(
      <InterviewSessionView
        exchanges={[createCandidateExchangeStoryFixture("团队目前最大的挑战是什么？")]}
        history={[]}
        isFinishing={false}
        isInteractionLocked={false}
        isSubmittingQuestion={false}
        onFinish={vi.fn(async () => undefined)}
        onSubmitQuestion={vi.fn(async () => {
          throw new Error("submit failed")
        })}
        prompt="现在请你向面试官提问。"
        status="candidateQuestions"
        summary={{ ...summary, completedMainQuestions: 3 }}
      />,
      { router: false },
    )

    const textbox = screen.getByRole("textbox", {
      name: i18n.t("interview.session.candidate.label"),
    })
    await user.type(textbox, question)
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.session.candidate.submit"),
      }),
    )

    expect(
      await screen.findByText(i18n.t("interview.session.errors.candidateSubmitTitle")),
    ).toBeVisible()
    expect(textbox).toHaveValue(question)
  })
})
