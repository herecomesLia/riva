import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { createCandidateQuestionExchange } from "@/mocks/data/interview"
import { renderWithProviders } from "@/test/render"

import { InterviewSessionView } from "../InterviewSessionView"
import { CandidateQuestionsStage } from "./CandidateQuestionsStage"

const question = "这个岗位入职六个月后的成功标准是什么？"
const exchange = createCandidateQuestionExchange(question, 1)

const stageProps = {
  exchanges: [exchange],
  isFinishing: false,
  isInteractionLocked: false,
  isSubmittingQuestion: false,
  onFinish: vi.fn(async () => undefined),
  onSubmitQuestion: vi.fn(async () => undefined),
  prompt: "现在请你以候选人身份提出问题。",
}

const summary = {
  targetRole: "高级前端工程师",
  company: "示例公司",
  round: "technical",
  difficulty: "pressure",
  completedMainQuestions: 3,
  totalMainQuestions: 3,
  planRevision: 1,
} as const

describe("candidate question analysis", () => {
  it("shows RIVA analysis, suggestions, focus, and the training disclaimer", () => {
    renderWithProviders(<CandidateQuestionsStage {...stageProps} />, { router: false })

    expect(screen.getByText(question)).toBeVisible()
    expect(screen.getByText(i18n.t("interview.session.candidate.analysis"))).toBeVisible()
    expect(screen.getByText(exchange.feedback.summary)).toBeVisible()
    expect(
      screen.getByText(i18n.t("interview.session.candidate.improvementSuggestions")),
    ).toBeVisible()
    expect(screen.getByText(exchange.feedback.improvementSuggestions[0]!)).toBeVisible()
    expect(screen.getByText(i18n.t("interview.session.candidate.recommendedFocus"))).toBeVisible()
    expect(screen.getByText(exchange.interviewerAnswer)).toBeVisible()
    expect(screen.getByText(i18n.t("interview.session.candidate.disclaimer"))).toBeVisible()
    expect(
      screen.queryByText(/HR回答|公司回答|面试官回答|HR answer|company answer|interviewer answer/i),
    ).not.toBeInTheDocument()
  })

  it("shows an explicit empty state when no analysis result is available", () => {
    const emptyExchange = structuredClone(exchange)
    emptyExchange.interviewerAnswer = ""
    emptyExchange.feedback = {
      summary: "",
      strengths: [],
      improvementSuggestions: [],
      suggestedAlternatives: [],
    }

    renderWithProviders(<CandidateQuestionsStage {...stageProps} exchanges={[emptyExchange]} />, {
      router: false,
    })

    expect(screen.getByText(question)).toBeVisible()
    expect(screen.getByText(i18n.t("interview.session.candidate.noAnalysisTitle"))).toBeVisible()
    expect(screen.getByText(i18n.t("interview.session.candidate.disclaimer"))).toBeVisible()
  })

  it("labels candidate-question generation failures as analysis errors", () => {
    renderWithProviders(
      <InterviewSessionView
        currentCandidateQuestion={exchange.question}
        generationStatus="failed"
        history={[]}
        isRetrying={false}
        onBack={vi.fn()}
        onRetry={vi.fn(async () => undefined)}
        retryFailed={false}
        status="generatingCandidateAnswer"
        summary={summary}
      />,
      { router: false },
    )

    expect(screen.getByText(question)).toBeVisible()
    expect(screen.getByText(i18n.t("interview.session.candidateAnswer.failedTitle"))).toBeVisible()
    expect(screen.getByText(i18n.t("interview.session.errors.candidateAnswerTitle"))).toBeVisible()
    expect(
      screen.queryByText(/HR回答|公司回答|面试官回答|HR answer|company answer|interviewer answer/i),
    ).not.toBeInTheDocument()
  })
})
