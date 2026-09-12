import { practiceFixture } from "@/mocks/fixtures/practice"
import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"
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
    const response = createPracticeScenario("reviewBalanced")
    if (response.session.status !== "review") throw new Error("Completed fixture required.")
    const archivedState = response.session.question.referenceAnswer
    if (!archivedState) throw new Error("Archived reference answer required.")
    const user = userEvent.setup()
    renderWithProviders(<PracticeReferenceAnswer mode="readonly" state={archivedState} />, {
      router: false,
    })

    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.expand") }),
    )
    if (archivedState.status !== "revealed") throw new Error("Reference content required.")
    expect(screen.getByText(archivedState.content.answer)).toBeVisible()
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
    const technicalResponse = createPracticeScenario("answeringQuestion")
    if (technicalResponse.session.status !== "answering") throw new Error("Question required.")
    const technical = {
      ...structuredClone(practiceFixture.questionHelp.reference),
      kind: "technicalReference" as const,
    }
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
