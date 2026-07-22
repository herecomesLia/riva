import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { createPracticeMockResponse, createPracticeReferenceAnswer } from "@/mocks/data/practice"
import { renderWithProviders } from "@/test/render"

import { PracticeReferenceAnswer } from "./PracticeReferenceAnswer"

const notRequested = {
  status: "notRequested",
  content: null,
  viewedBeforeSubmission: false,
} as const

describe("PracticeReferenceAnswer", () => {
  it("only requests after confirmation and rejects same-frame double confirmation", async () => {
    let resolveRequest: ((value: "executed") => void) | undefined
    const onRequest = vi.fn(() => new Promise<"executed">((resolve) => (resolveRequest = resolve)))
    const user = userEvent.setup()
    renderWithProviders(<PracticeReferenceAnswer onRequest={onRequest} state={notRequested} />, {
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

  it("keeps confirmation available without an error when the interaction is ignored", async () => {
    const onRequest = vi.fn(async () => "ignored" as const)
    const user = userEvent.setup()
    renderWithProviders(<PracticeReferenceAnswer onRequest={onRequest} state={notRequested} />, {
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
    const technical = createPracticeReferenceAnswer("technicalFoundation")
    const { rerender } = renderWithProviders(
      <PracticeReferenceAnswer
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
    rerender(<PracticeReferenceAnswer onRequest={onRequest} state={notRequested} />)
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
