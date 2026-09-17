import { practiceFixture } from "@/mocks/fixtures/practice"
import * as testing from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"

import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: answering", () => {
  it("confirms, locks, preserves the draft, and applies the reference-answer snapshot", async () => {
    const initial = api.createPracticeScenario("answeringQuestion")
    if (initial.session.status !== "answering") throw new Error("Answering fixture required.")
    const revealed = structuredClone(initial)
    if (revealed.session.status !== "answering") throw new Error("Answering fixture required.")
    const revealedSession = revealed.session

    revealedSession.question.referenceAnswer = {
      status: "revealed",
      content: structuredClone(practiceFixture.questionHelp.reference),
      viewedBeforeSubmission: true,
    }
    const request = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(initial)
    vi.mocked(api.requestPracticeReferenceAnswer).mockReturnValue(request.promise)
    const user = userEvent.setup()
    context.renderPracticePage()

    const textbox = await testing.screen.findByRole("textbox")
    const submitButton = testing.screen.getByRole("button", {
      name: i18n.t("practice.answer.submit"),
    })
    await user.type(textbox, "保留这份草稿")
    expect(
      testing.screen.queryByText(revealedSession.question.referenceAnswer.content.answer),
    ).toBeNull()
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.referenceAnswer.request") }),
    )
    expect(api.requestPracticeReferenceAnswer).not.toHaveBeenCalled()
    const dialog = testing.screen.getByRole("alertdialog")
    const confirm = testing.within(dialog).getByRole("button", {
      name: i18n.t("practice.referenceAnswer.confirm"),
    })
    await user.click(confirm)
    expect(api.requestPracticeReferenceAnswer).toHaveBeenCalledTimes(1)
    expect(submitButton).toBeDisabled()

    request.resolve(revealed.session)
    expect(
      await testing.screen.findByText(revealedSession.question.referenceAnswer.content.answer),
    ).toBeVisible()
    expect(textbox).toHaveValue("保留这份草稿")
  })

  it("updates review saved state only from the returned service snapshot", async () => {
    const user = userEvent.setup()
    const review = api.createPracticeScenario("reviewBalanced")
    const saved = structuredClone(review)
    if (review.session.status !== "review" || saved.session.status !== "review") {
      throw new Error("Review fixtures are required.")
    }

    saved.session.question.isSaved = true
    vi.mocked(api.getPracticePage).mockResolvedValue(review)
    vi.mocked(api.setQuestionSaved).mockResolvedValue(saved.session)

    context.renderPracticePage()

    await user.click(
      await testing.screen.findByRole("button", { name: i18n.t("practice.questionActions.save") }),
    )
    expect(vi.mocked(api.setQuestionSaved).mock.calls[0]?.[0]).toEqual(true)
    expect(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.questionActions.unsave"),
      }),
    ).toHaveAttribute("aria-pressed", "true")
  })

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
      testing.screen.getByRole("button", { name: i18n.t("practice.guidance.requestHint") }),
    ).toBeDisabled()
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.guidance.requestFramework") }),
    ).toBeDisabled()
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.questionActions.save") }),
    ).toBeDisabled()
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.questionActions.markWeak") }),
    ).toBeDisabled()
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.questionActions.skip") }),
    ).toBeDisabled()
    expect(
      testing.screen.queryByRole("button", { name: i18n.t("practice.review.endSession") }),
    ).toBeNull()
    await user.click(pendingButton)
    expect(api.submitPrimaryAnswer).toHaveBeenCalledTimes(1)
    expect(api.requestPracticeHint).not.toHaveBeenCalled()
    expect(api.requestAnswerFramework).not.toHaveBeenCalled()
    expect(api.setQuestionSaved).not.toHaveBeenCalled()
    expect(api.setQuestionWeak).not.toHaveBeenCalled()
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

  it("locks every action while a hint request is pending", async () => {
    const user = userEvent.setup()
    const answering = api.createPracticeScenario("answeringQuestion")
    const hinted = api.createPracticeScenario("answeringHintRevealed")
    if (answering.session.status !== "answering" || hinted.session.status !== "answering") {
      throw new Error("Answering fixtures are required.")
    }

    const request = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(answering)
    vi.mocked(api.requestPracticeHint).mockReturnValue(request.promise)

    context.renderPracticePage()

    const textarea = await testing.screen.findByLabelText(i18n.t("practice.answer.label"))
    await user.type(textarea, "我先说明背景。")
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.guidance.requestHint") }),
    )

    expect(
      await testing.screen.findByRole("button", { name: i18n.t("practice.guidance.requestHint") }),
    ).toBeDisabled()
    const lockedButtonNames = [
      i18n.t("practice.guidance.requestFramework"),
      i18n.t("practice.questionActions.save"),
      i18n.t("practice.questionActions.markWeak"),
      i18n.t("practice.questionActions.skip"),
      i18n.t("practice.answer.submit"),
    ]
    for (const name of lockedButtonNames) {
      expect(testing.screen.getByRole("button", { name })).toBeDisabled()
    }
    expect(textarea).toBeEnabled()
    await user.type(textarea, "我仍可继续编辑。")
    expect(textarea).toHaveValue("我先说明背景。我仍可继续编辑。")

    await testing.act(async () => {
      request.resolve(hinted.session)
      await request.promise
    })

    expect(
      await testing.screen.findByText(hinted.session.question.hints.content?.[0] ?? ""),
    ).toBeVisible()
    for (const name of lockedButtonNames.slice(0, -1)) {
      expect(testing.screen.getByRole("button", { name })).toBeEnabled()
    }
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.answer.submit") }),
    ).toBeEnabled()
  })

  it("does not start a weak mutation while saving is pending", async () => {
    const user = userEvent.setup()
    const answering = api.createPracticeScenario("answeringQuestion")
    const saved = api.createPracticeScenario("answeringSavedQuestion")
    if (answering.session.status !== "answering" || saved.session.status !== "answering") {
      throw new Error("Answering fixtures are required.")
    }

    const request = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(answering)
    vi.mocked(api.setQuestionSaved).mockReturnValue(request.promise)

    context.renderPracticePage()

    await user.click(
      await testing.screen.findByRole("button", { name: i18n.t("practice.questionActions.save") }),
    )
    const weakButton = testing.screen.getByRole("button", {
      name: i18n.t("practice.questionActions.markWeak"),
    })
    expect(weakButton).toBeDisabled()
    await user.click(weakButton)
    expect(api.setQuestionWeak).not.toHaveBeenCalled()

    await testing.act(async () => {
      request.resolve(saved.session)
      await request.promise
    })
    expect(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.questionActions.unsave"),
      }),
    ).toBeEnabled()
  })

  it("keeps an unsubmitted draft when a same-frame mutation is ignored", async () => {
    const user = userEvent.setup()
    const answering = api.createPracticeScenario("answeringQuestion")
    const saved = api.createPracticeScenario("answeringSavedQuestion")
    if (answering.session.status !== "answering" || saved.session.status !== "answering") {
      throw new Error("Answering fixtures are required.")
    }

    const saving = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(answering)
    vi.mocked(api.setQuestionSaved).mockReturnValue(saving.promise)
    const { router } = context.renderPracticePage()
    const answer = "这段回答不能因为同步锁忽略提交而被清空。"
    const textarea = await testing.screen.findByLabelText(i18n.t("practice.answer.label"))
    await user.type(textarea, answer)

    testing.act(() => {
      testing.fireEvent.click(
        testing.screen.getByRole("button", { name: i18n.t("practice.questionActions.save") }),
      )
      testing.fireEvent.click(
        testing.screen.getByRole("button", { name: i18n.t("practice.answer.submit") }),
      )
    })

    await testing.waitFor(() => expect(api.setQuestionSaved).toHaveBeenCalledTimes(1))
    expect(api.submitPrimaryAnswer).not.toHaveBeenCalled()
    expect(textarea).toHaveValue(answer)
    testing.act(() => {
      void router?.navigate({ to: "/profile" })
    })
    expect(
      await testing.screen.findByText(i18n.t("practice.dialog.leaveTitle")),
    ).toBeInTheDocument()
    expect(router?.state.location.pathname).toBe("/practice")

    await testing.act(async () => {
      saving.resolve(saved.session)
      await saving.promise
    })
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

  it("updates saved and weak question state from mutation snapshots", async () => {
    const user = userEvent.setup()
    const answering = api.createPracticeScenario("answeringQuestion")
    const saved = api.createPracticeScenario("answeringSavedQuestion")
    const weak = api.createPracticeScenario("answeringWeakQuestion")
    if (
      answering.session.status !== "answering" ||
      saved.session.status !== "answering" ||
      weak.session.status !== "answering"
    ) {
      throw new Error("Answering fixtures are required.")
    }

    weak.session.question.isSaved = true
    vi.mocked(api.getPracticePage).mockResolvedValue(answering)
    vi.mocked(api.setQuestionSaved).mockResolvedValue(saved.session)
    vi.mocked(api.setQuestionWeak).mockResolvedValue(weak.session)

    context.renderPracticePage()

    await user.click(
      await testing.screen.findByRole("button", { name: i18n.t("practice.questionActions.save") }),
    )
    expect(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.questionActions.unsave"),
      }),
    ).toHaveAttribute("aria-pressed", "true")

    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.questionActions.markWeak") }),
    )
    expect(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.questionActions.unmarkWeak"),
      }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("synchronously locks duplicate follow-up assistance and preserves the draft on cache sync", async () => {
    const initial = api.createPracticeScenario("answeringSingleFollowUp")
    if (initial.session.status !== "answeringFollowUp") {
      throw new Error("Follow-up fixture required.")
    }
    const revealed = structuredClone(initial)
    if (revealed.session.status !== "answeringFollowUp") {
      throw new Error("Follow-up fixture required.")
    }

    const template = practiceFixture.followUp
    revealed.session.currentFollowUp.hints = {
      status: "revealed",
      content: [...template.hints],
    }
    const request = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(initial)
    vi.mocked(api.requestPracticeFollowUpHint).mockReturnValue(request.promise)
    const user = userEvent.setup()
    context.renderPracticePage()
    const textbox = await testing.screen.findByLabelText(i18n.t("practice.followUp.answerLabel"))
    await user.type(textbox, "辅助请求期间继续保留并编辑的草稿")
    const hint = testing.screen.getByRole("button", {
      name: i18n.t("practice.followUpAssistance.viewHint"),
    })

    testing.fireEvent.click(hint)
    testing.fireEvent.click(hint)
    await testing.waitFor(() => expect(api.requestPracticeFollowUpHint).toHaveBeenCalledTimes(1))
    expect(textbox).toBeEnabled()
    expect(textbox).toHaveValue("辅助请求期间继续保留并编辑的草稿")
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }),
    ).toBeDisabled()
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.endAnswering") }),
    ).toBeDisabled()

    await testing.act(async () => request.resolve(revealed.session))
    expect(await testing.screen.findByText(template.hints[0]!)).toBeVisible()
    expect(textbox).toHaveValue("辅助请求期间继续保留并编辑的草稿")
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
