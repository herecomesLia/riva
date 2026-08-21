import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import {
  createGeneratedPracticeQuestion,
  createPracticeMockResponse,
  createPracticeReferenceAnswer,
  getMockQuestionTemplateId,
} from "@/mocks/data/practice"
import { renderWithProviders } from "@/test/render"

import { PracticeReferenceAnswer } from "./PracticeReferenceAnswer"

const notRequested = {
  status: "notRequested",
  content: null,
  viewedBeforeSubmission: false,
} as const

function answeringProps(onRequest: () => Promise<"executed" | "ignored">) {
  return {
    assistedRetry: false,
    interactionLocked: false,
    isPending: false,
    mode: "answering" as const,
    onRequest,
    state: notRequested,
  }
}

describe("PracticeReferenceAnswer", () => {
  it("shows SparklesIcon before the request label and replaces it with Spinner while pending", () => {
    const onRequest = vi.fn(async () => "executed" as const)
    const { rerender } = renderWithProviders(
      <PracticeReferenceAnswer {...answeringProps(onRequest)} />,
      { router: false },
    )

    const requestButton = screen.getByRole("button", {
      name: i18n.t("practice.referenceAnswer.request"),
    })
    const sparklesIcon = requestButton.querySelector(".lucide-sparkles")
    expect(sparklesIcon).toHaveAttribute("aria-hidden", "true")
    expect(sparklesIcon).toHaveAttribute("data-icon", "inline-start")
    expect(requestButton.querySelector('[data-slot="spinner"]')).not.toBeInTheDocument()

    rerender(<PracticeReferenceAnswer {...answeringProps(onRequest)} isPending />)

    const pendingButton = screen.getByRole("button", {
      name: i18n.t("practice.referenceAnswer.generating"),
    })
    expect(pendingButton).toHaveTextContent(i18n.t("practice.referenceAnswer.generating"))
    expect(pendingButton.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
    expect(pendingButton.querySelector(".lucide-sparkles")).not.toBeInTheDocument()
  })

  it("only requests after confirmation and rejects same-frame double confirmation", async () => {
    let resolveRequest: ((value: "executed") => void) | undefined
    const onRequest = vi.fn(() => new Promise<"executed">((resolve) => (resolveRequest = resolve)))
    const user = userEvent.setup()
    renderWithProviders(<PracticeReferenceAnswer {...answeringProps(onRequest)} />, {
      router: false,
    })

    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.request") }),
    )
    expect(onRequest).not.toHaveBeenCalled()
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", {
      name: i18n.t("practice.referenceAnswer.confirm"),
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(onRequest).toHaveBeenCalledTimes(1)
    resolveRequest?.("executed")
  })

  it("renders an archived attempt directly in readonly mode", async () => {
    const response = createPracticeMockResponse("completedSession")
    if (response.session.status !== "completed") throw new Error("Completed fixture required.")
    const archivedState = response.session.attemptRecords[0]?.question.referenceAnswer
    if (!archivedState) throw new Error("Archived reference answer required.")
    const user = userEvent.setup()
    renderWithProviders(<PracticeReferenceAnswer mode="readonly" state={archivedState} />, {
      router: false,
    })

    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.expand") }),
    )
    expect(
      screen.getByRole("heading", { name: i18n.t("practice.referenceAnswer.keyPoints") }),
    ).toBeVisible()
    expect(screen.getAllByRole("list")).toHaveLength(2)
  })

  it("uses the main-question title and preserves review polling errors", () => {
    renderWithProviders(
      <PracticeReferenceAnswer
        mode="review"
        pollingError
        state={{ status: "generating", content: null, viewedBeforeSubmission: false }}
      />,
      { router: false },
    )

    expect(
      screen.getByRole("heading", {
        name: i18n.t("practice.referenceAnswer.reviewTitle"),
      }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("practice-reference-answer-polling-error")).toHaveTextContent(
      i18n.t("practice.referenceAnswer.requestErrorDescription"),
    )
  })

  it("keeps confirmation available without an error when the interaction is ignored", async () => {
    const onRequest = vi.fn(async () => "ignored" as const)
    const user = userEvent.setup()
    renderWithProviders(<PracticeReferenceAnswer {...answeringProps(onRequest)} />, {
      router: false,
    })
    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.request") }),
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: i18n.t("practice.referenceAnswer.confirm"),
      }),
    )
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("shows technical content and safe request errors", async () => {
    const technicalQuestion = createGeneratedPracticeQuestion({
      sessionId: "practice-reference-technical",
      ordinal: 1,
      selection: {
        targetRoleId: "role_frontend_bytedance",
        questionType: "technicalFoundation",
        difficulty: "basic",
        source: "personalized",
        prioritizeWeaknesses: false,
      },
    })
    const technical = createPracticeReferenceAnswer({
      templateId: getMockQuestionTemplateId(technicalQuestion),
      questionType: technicalQuestion.questionType,
      targetRoleTitle: "Senior Frontend Engineer",
      questionPrompt: technicalQuestion.prompt,
      recommendedMaterials: technicalQuestion.recommendedMaterials,
    })
    const { rerender } = renderWithProviders(
      <PracticeReferenceAnswer
        mode="review"
        state={{ status: "revealed", content: technical, viewedBeforeSubmission: true }}
      />,
      { router: false },
    )
    expect(
      screen.getByText(i18n.t("practice.referenceAnswer.kind.technicalReference")),
    ).toBeVisible()

    const onRequest = vi.fn(async () => {
      throw new Error("session-id secret stack")
    })
    rerender(<PracticeReferenceAnswer {...answeringProps(onRequest)} />)
    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.request") }),
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: i18n.t("practice.referenceAnswer.confirm"),
      }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.referenceAnswer.requestErrorDescription"),
    )
    expect(screen.queryByText(/session-id secret stack/i)).not.toBeInTheDocument()
  })
})
