import * as testing from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"

import { PRACTICE_QUERY_KEY } from "../hooks/usePracticeSession"
import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: answering", () => {
  it("confirms, locks, preserves the draft, and applies the reference-answer snapshot", async () => {
    const initial = api.createPracticeMockResponse("answeringQuestion")
    if (initial.session.status !== "answering") throw new Error("Answering fixture required.")
    const revealed = structuredClone(initial)
    if (revealed.session.status !== "answering") throw new Error("Answering fixture required.")
    const revealedSession = revealed.session
    revealedSession.version += 1
    revealedSession.question.referenceAnswer = {
      status: "revealed",
      content: api.createPracticeReferenceAnswer({
        templateId: initial.session.question.templateId,
        questionType: initial.session.question.questionType,
        targetRoleTitle: "Senior Frontend Engineer",
        questionPrompt: initial.session.question.prompt,
        recommendedMaterials: initial.session.question.recommendedMaterials,
      }),
      viewedBeforeSubmission: true,
    }
    const request = context.createDeferred<import("@/models/practice").PracticePageResponse>()
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
    expect(vi.mocked(api.requestPracticeReferenceAnswer).mock.calls[0]?.[0]).toEqual({
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    })
    expect(submitButton).toBeDisabled()

    request.resolve(revealed)
    expect(
      await testing.screen.findByText(revealedSession.question.referenceAnswer.content.answer),
    ).toBeVisible()
    expect(textbox).toHaveValue("保留这份草稿")
  })

  it("updates review saved state only from the returned service snapshot", async () => {
    const user = userEvent.setup()
    const review = api.createPracticeMockResponse("reviewBalanced")
    const saved = structuredClone(review)
    if (review.session.status !== "review" || saved.session.status !== "review") {
      throw new Error("Review fixtures are required.")
    }
    saved.session.version += 1
    saved.session.question.isSaved = true
    vi.mocked(api.getPracticePage).mockResolvedValue(review)
    vi.mocked(api.setQuestionSaved).mockResolvedValue(saved)

    context.renderPracticePage()

    await user.click(
      await testing.screen.findByRole("button", { name: i18n.t("practice.questionActions.save") }),
    )
    expect(vi.mocked(api.setQuestionSaved).mock.calls[0]?.[0]).toEqual({
      sessionId: review.session.sessionId,
      version: review.session.version,
      questionId: review.session.question.id,
      isSaved: true,
    })
    expect(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.questionActions.unsave"),
      }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("navigates to the existing training-history page without preparing another round", async () => {
    const user = userEvent.setup()
    vi.mocked(api.getPracticePage).mockResolvedValue(
      api.createPracticeMockResponse("completedSession"),
    )
    const { router } = context.renderPracticePage()

    await user.click(
      await testing.screen.findByRole("button", { name: i18n.t("practice.completed.viewHistory") }),
    )

    await testing.waitFor(() => expect(router?.state.location.pathname).toBe("/history"))
    expect(api.prepareNextPracticeSession).not.toHaveBeenCalled()
  })

  it("prevents duplicate main-answer submission and enters follow-up", async () => {
    const user = userEvent.setup()
    const answering = api.createPracticeMockResponse("answeringQuestion")
    const following = api.createPracticeMockResponse("answeringFirstFollowUp")
    if (
      answering.session.status !== "answering" ||
      following.session.status !== "answeringFollowUp"
    ) {
      throw new Error("Answering and follow-up fixtures are required.")
    }
    following.session.version = answering.session.version + 1
    const submission = context.createDeferred<import("@/models/practice").PracticePageResponse>()
    vi.mocked(api.getPracticePage).mockResolvedValue(answering)
    vi.mocked(api.submitPrimaryAnswer).mockReturnValue(submission.promise)

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
      testing.screen.getByRole("button", { name: i18n.t("practice.questionActions.end") }),
    ).toBeDisabled()
    await user.click(pendingButton)
    expect(api.submitPrimaryAnswer).toHaveBeenCalledTimes(1)
    expect(api.requestPracticeHint).not.toHaveBeenCalled()
    expect(api.requestAnswerFramework).not.toHaveBeenCalled()
    expect(api.setQuestionSaved).not.toHaveBeenCalled()
    expect(api.setQuestionWeak).not.toHaveBeenCalled()
    expect(api.skipPracticeQuestion).not.toHaveBeenCalled()
    expect(api.requestEndPracticeSession).not.toHaveBeenCalled()

    await testing.act(async () => {
      submission.resolve(following)
      await submission.promise
    })
    expect(
      await testing.screen.findByTestId("practice-answering-follow-up-state"),
    ).toBeInTheDocument()
  })

  it("locks every versioned action while a hint request is pending", async () => {
    const user = userEvent.setup()
    const answering = api.createPracticeMockResponse("answeringQuestion")
    const hinted = api.createPracticeMockResponse("answeringHintRevealed")
    if (answering.session.status !== "answering" || hinted.session.status !== "answering") {
      throw new Error("Answering fixtures are required.")
    }
    hinted.session.version = answering.session.version + 1
    const request = context.createDeferred<import("@/models/practice").PracticePageResponse>()
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
      i18n.t("practice.questionActions.end"),
      i18n.t("practice.answer.submit"),
    ]
    for (const name of lockedButtonNames) {
      expect(testing.screen.getByRole("button", { name })).toBeDisabled()
    }
    expect(textarea).toBeEnabled()
    await user.type(textarea, "我仍可继续编辑。")
    expect(textarea).toHaveValue("我先说明背景。我仍可继续编辑。")

    await testing.act(async () => {
      request.resolve(hinted)
      await request.promise
    })

    expect(
      await testing.screen.findByText(hinted.session.question.answerHints.content?.[0] ?? ""),
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
    const answering = api.createPracticeMockResponse("answeringQuestion")
    const saved = api.createPracticeMockResponse("answeringSavedQuestion")
    if (answering.session.status !== "answering" || saved.session.status !== "answering") {
      throw new Error("Answering fixtures are required.")
    }
    saved.session.version = answering.session.version + 1
    const request = context.createDeferred<import("@/models/practice").PracticePageResponse>()
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
      request.resolve(saved)
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
    const answering = api.createPracticeMockResponse("answeringQuestion")
    const saved = api.createPracticeMockResponse("answeringSavedQuestion")
    if (answering.session.status !== "answering" || saved.session.status !== "answering") {
      throw new Error("Answering fixtures are required.")
    }
    saved.session.version = answering.session.version + 1
    const saving = context.createDeferred<import("@/models/practice").PracticePageResponse>()
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
      saving.resolve(saved)
      await saving.promise
    })
  })

  it("keeps the draft and route blocker after same-frame duplicate submission fails", async () => {
    const user = userEvent.setup()
    const answering = api.createPracticeMockResponse("answeringQuestion")
    if (answering.session.status !== "answering")
      throw new Error("An answering fixture is required.")
    const submission = context.createDeferred<import("@/models/practice").PracticePageResponse>()
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
    const answering = api.createPracticeMockResponse("answeringQuestion")
    const saved = api.createPracticeMockResponse("answeringSavedQuestion")
    const weak = api.createPracticeMockResponse("answeringWeakQuestion")
    if (
      answering.session.status !== "answering" ||
      saved.session.status !== "answering" ||
      weak.session.status !== "answering"
    ) {
      throw new Error("Answering fixtures are required.")
    }
    saved.session.version = answering.session.version + 1
    weak.session.version = saved.session.version + 1
    weak.session.question.isSaved = true
    vi.mocked(api.getPracticePage).mockResolvedValue(answering)
    vi.mocked(api.setQuestionSaved).mockResolvedValue(saved)
    vi.mocked(api.setQuestionWeak).mockResolvedValue(weak)

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
    const initial = api.createPracticeMockResponse("answeringSingleFollowUp")
    if (initial.session.status !== "answeringFollowUp") {
      throw new Error("Follow-up fixture required.")
    }
    const revealed = structuredClone(initial)
    if (revealed.session.status !== "answeringFollowUp") {
      throw new Error("Follow-up fixture required.")
    }
    revealed.session.version += 1
    const template = api.getPracticeFollowUpPlan(revealed.session.question.templateId)[0]!
    revealed.session.currentFollowUp.question.answerHints = {
      status: "revealed",
      content: [...template.answerHints],
    }
    const request = context.createDeferred<import("@/models/practice").PracticePageResponse>()
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

    await testing.act(async () => request.resolve(revealed))
    expect(await testing.screen.findByText(template.answerHints[0]!)).toBeVisible()
    expect(textbox).toHaveValue("辅助请求期间继续保留并编辑的草稿")
  })

  it("submits a follow-up once, keeps the failed draft, and keeps route blocking active", async () => {
    const user = userEvent.setup()
    const following = api.createPracticeMockResponse("answeringSingleFollowUp")
    if (following.session.status !== "answeringFollowUp") {
      throw new Error("A follow-up fixture is required.")
    }
    const submission = context.createDeferred<import("@/models/practice").PracticePageResponse>()
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
    expect(vi.mocked(api.submitFollowUpAnswer).mock.calls[0]?.[0]).toEqual({
      sessionId: following.session.sessionId,
      version: following.session.version,
      questionId: following.session.question.id,
      followUpQuestionId: following.session.currentFollowUp.question.id,
      content,
    })
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

  it("does not let an old follow-up response overwrite a newer session state", async () => {
    const user = userEvent.setup()
    const following = api.createPracticeMockResponse("answeringSingleFollowUp")
    const staleNext = api.createPracticeMockResponse("answeringFollowUp")
    const newer = api.createPracticeMockResponse("evaluatingAnswer")
    if (
      following.session.status !== "answeringFollowUp" ||
      staleNext.session.status !== "answeringFollowUp" ||
      newer.session.status !== "evaluating"
    ) {
      throw new Error("Follow-up and evaluating fixtures are required.")
    }
    staleNext.session.version = following.session.version + 1
    newer.session.version = following.session.version + 2
    const submission = context.createDeferred<import("@/models/practice").PracticePageResponse>()
    vi.mocked(api.getPracticePage).mockResolvedValue(following)
    vi.mocked(api.getPracticeEvaluationStatus).mockResolvedValue(newer)
    vi.mocked(api.submitFollowUpAnswer).mockReturnValue(submission.promise)
    const renderResult = context.renderPracticePage()

    await user.type(
      await testing.screen.findByLabelText(i18n.t("practice.followUp.answerLabel")),
      "这是当前追问的回答。",
    )
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }),
    )
    await testing.waitFor(() => expect(api.submitFollowUpAnswer).toHaveBeenCalledTimes(1))
    testing.act(() => {
      renderResult.queryClient.setQueryData(PRACTICE_QUERY_KEY, newer)
    })
    await testing.act(async () => {
      submission.resolve(staleNext)
      await submission.promise
    })

    expect(renderResult.queryClient.getQueryData(PRACTICE_QUERY_KEY)).toEqual(newer)
    expect(await testing.screen.findByTestId("practice-evaluating-state")).toBeInTheDocument()
    expect(
      testing.screen.queryByTestId("practice-answering-follow-up-state"),
    ).not.toBeInTheDocument()
    expect(
      testing.screen.queryByLabelText(i18n.t("practice.followUp.answerLabel")),
    ).not.toBeInTheDocument()
  })
})
