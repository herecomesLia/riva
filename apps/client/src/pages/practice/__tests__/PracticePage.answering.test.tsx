import * as testing from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"

import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: answering", () => {
  it("navigates to the existing training-history page without preparing another round", async () => {
    const user = userEvent.setup()
    vi.mocked(api.getPracticePage).mockResolvedValue(api.createPracticeScenario("completedSession"))
    const { router } = context.renderPracticePage()

    await user.click(
      await testing.screen.findByRole("button", { name: i18n.t("practice.completed.viewHistory") }),
    )

    await testing.waitFor(() => expect(router?.state.location.pathname).toBe("/history"))
    expect(api.prepareNextPracticeSession).not.toHaveBeenCalled()
  })

  it("prevents duplicate submission and preserves the answer while processing before follow-up", async () => {
    const user = userEvent.setup()
    const answering = api.createPracticeScenario("answeringQuestion")
    const following = api.createPracticeScenario("answeringFirstFollowUp")
    if (
      answering.session.status !== "answering" ||
      following.session.status !== "answeringFollowUp"
    ) {
      throw new Error("Answering and follow-up fixtures are required.")
    }

    const submission =
      context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    const task = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    const processing = api.createPracticeScenario("processingNoFollowUp")
    if (processing.session.status !== "processing") throw new Error("Processing fixture required.")
    processing.session.mainAnswer.content = "我负责定位问题并推动方案落地。"
    following.session.mainAnswer = structuredClone(processing.session.mainAnswer)
    vi.mocked(api.getPracticePage).mockResolvedValue(answering)
    vi.mocked(api.submitPrimaryAnswer).mockReturnValue(submission.promise)
    vi.mocked(api.getPracticeTaskStatus).mockReturnValue(task.promise)

    context.renderPracticePage()

    await user.type(
      await testing.screen.findByLabelText(i18n.t("practice.answer.label")),
      "我负责定位问题并推动方案落地。",
    )
    await user.click(testing.screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))
    const pendingButton = await testing.screen.findByRole("button", {
      name: i18n.t("practice.answer.submitting"),
    })
    expect(pendingButton).toBeDisabled()
    expect(testing.screen.getByLabelText(i18n.t("practice.answer.label"))).toBeDisabled()

    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.questionActions.skip") }),
    ).toBeDisabled()
    expect(
      testing.screen.queryByRole("button", { name: i18n.t("practice.review.endSession") }),
    ).toBeNull()
    await user.click(pendingButton)
    expect(api.submitPrimaryAnswer).toHaveBeenCalledTimes(1)

    expect(api.skipPracticeQuestion).not.toHaveBeenCalled()
    expect(api.endPracticeSession).not.toHaveBeenCalled()

    await testing.act(async () => {
      submission.resolve(processing.session)
      await submission.promise
    })
    expect(await testing.screen.findByTestId("practice-processing-status")).toHaveTextContent(
      i18n.t("practice.processing.title"),
    )
    expect(testing.screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(
      "我负责定位问题并推动方案落地。",
    )
    expect(testing.screen.queryByRole("textbox")).toBeNull()
    await testing.act(async () => {
      task.resolve(following.session)
      await task.promise
    })
    expect(
      await testing.screen.findByTestId("practice-answering-follow-up-state"),
    ).toBeInTheDocument()
  })

  it("keeps the draft and route blocker after same-frame duplicate submission fails", async () => {
    const user = userEvent.setup()
    const answering = api.createPracticeScenario("answeringQuestion")
    if (answering.session.status !== "answering")
      throw new Error("An answering fixture is required.")
    const submission =
      context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(answering)
    vi.mocked(api.submitPrimaryAnswer).mockReturnValue(submission.promise)
    const { router } = context.renderPracticePage()
    const answer = "第一次提交失败后必须保留的完整回答。"
    const textarea = await testing.screen.findByLabelText(i18n.t("practice.answer.label"))
    await user.type(textarea, answer)
    const submitButton = testing.screen.getByRole("button", {
      name: i18n.t("practice.answer.submit"),
    })

    testing.act(() => {
      testing.fireEvent.click(submitButton)
      testing.fireEvent.click(submitButton)
    })

    await testing.waitFor(() => expect(api.submitPrimaryAnswer).toHaveBeenCalledTimes(1))
    await testing.act(async () => {
      submission.reject(new Error("unsafe submission details"))
      await submission.promise.catch(() => undefined)
    })

    expect(await testing.screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.submitDescription"),
    )
    expect(textarea).toHaveValue(answer)
    testing.act(() => {
      void router?.navigate({ to: "/profile" })
    })
    expect(
      await testing.screen.findByText(i18n.t("practice.dialog.leaveTitle")),
    ).toBeInTheDocument()
    expect(router?.state.location.pathname).toBe("/practice")
  })

  it("submits a follow-up once, keeps the failed draft, and keeps route blocking active", async () => {
    const user = userEvent.setup()
    const following = api.createPracticeScenario("answeringSingleFollowUp")
    if (following.session.status !== "answeringFollowUp") {
      throw new Error("A follow-up fixture is required.")
    }
    const submission =
      context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(following)
    vi.mocked(api.submitFollowUpAnswer).mockReturnValue(submission.promise)
    const { router } = context.renderPracticePage()
    const content = "我会更早确认协作方约束，并约定可验证的共识标准。"
    const textbox = await testing.screen.findByLabelText(i18n.t("practice.followUp.answerLabel"))
    await user.type(textbox, content)
    const submitButton = testing.screen.getByRole("button", {
      name: i18n.t("practice.followUp.submit"),
    })

    testing.act(() => {
      testing.fireEvent.click(submitButton)
      testing.fireEvent.click(submitButton)
    })

    await testing.waitFor(() => expect(api.submitFollowUpAnswer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.submitFollowUpAnswer).mock.calls[0]?.[0]).toEqual(content)
    expect(
      await testing.screen.findByRole("button", { name: i18n.t("practice.followUp.submitting") }),
    ).toBeDisabled()
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.endAnswering") }),
    ).toBeDisabled()

    await testing.act(async () => {
      submission.reject(new Error("unsafe follow-up failure"))
      await submission.promise.catch(() => undefined)
    })

    expect(await testing.screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.followUpSubmitDescription"),
    )
    expect(textbox).toHaveValue(content)
    testing.act(() => {
      void router?.navigate({ to: "/profile" })
    })
    expect(
      await testing.screen.findByText(i18n.t("practice.dialog.leaveFollowUpTitle")),
    ).toBeInTheDocument()
    expect(router?.state.location.pathname).toBe("/practice")
  })
})
