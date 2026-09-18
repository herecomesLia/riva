import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"
import * as api from "./practice-page-test-api"
import {
  createDeferred,
  mockPractice,
  practiceAt,
  renderPracticePage,
} from "./practice-page-test-utils"

describe("PracticePage: answering", () => {
  it("navigates from the ended session to history without creating another session", async () => {
    mockPractice(practiceAt("review"))
    vi.mocked(api.endPracticeSession).mockImplementation(async () => {
      mockPractice(practiceAt("completed"))
    })
    const { router } = renderPracticePage()
    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("practice.review.endSession") }),
    )
    await userEvent.click(
      screen.getAllByRole("button", { name: i18n.t("practice.review.endSession") }).at(-1)!,
    )
    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("practice.completed.viewHistory") }),
    )
    await waitFor(() => expect(router?.state.location.pathname).toBe("/history"))
    expect(api.createPractice).not.toHaveBeenCalled()
  })

  it("submits the exact question once and reads processing and follow-up states", async () => {
    const user = userEvent.setup()
    const answering = practiceAt("answering")
    const processing = practiceAt("processing")
    const content = "我负责定位问题并推动方案落地。"
    processing.rounds[0].turns[1].content = content
    const following = practiceAt("followUp")
    following.rounds[0].turns[1].content = content
    mockPractice(answering)
    const submission = createDeferred<void>()
    vi.mocked(api.submitPracticeAnswer).mockImplementation(async () => {
      await submission.promise
      mockPractice(processing, { status: "running", error: null })
    })
    const { queryClient } = renderPracticePage()
    await user.type(await screen.findByLabelText(i18n.t("practice.answer.label")), content)
    const button = screen.getByRole("button", { name: i18n.t("practice.answer.submit") })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await waitFor(() => expect(api.submitPracticeAnswer).toHaveBeenCalledTimes(1))
    expect(api.submitPracticeAnswer).toHaveBeenCalledWith(answering.id, answering.rounds[0].id, {
      questionId: answering.rounds[0].turns[0].id,
      content,
    })
    expect(screen.getByLabelText(i18n.t("practice.answer.label"))).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionActions.skip") }),
    ).toBeDisabled()
    await act(async () => {
      submission.resolve()
      await submission.promise
    })
    expect(await screen.findByTestId("practice-processing-status")).toBeInTheDocument()
    expect(screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(content)
    expect(screen.queryByRole("textbox")).toBeNull()
    mockPractice(following)
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["practices"] })
    })
    expect(await screen.findByTestId("practice-answering-follow-up-state")).toBeInTheDocument()
  })

  it.each([
    [
      "answering",
      "practice.answer.label",
      "practice.answer.submit",
      "practice.errors.submitDescription",
      "practice.dialog.leaveTitle",
      0,
    ],
    [
      "followUp",
      "practice.followUp.answerLabel",
      "practice.followUp.submit",
      "practice.errors.followUpSubmitDescription",
      "practice.dialog.leaveFollowUpTitle",
      2,
    ],
  ] as const)(
    "preserves the %s draft and navigation blocker after a duplicate submission fails",
    async (stage, label, submit, error, leave, questionIndex) => {
      const user = userEvent.setup()
      const practice = practiceAt(stage)
      mockPractice(practice)
      const submission = createDeferred<void>()
      vi.mocked(api.submitPracticeAnswer).mockReturnValue(submission.promise)
      const { router, queryClient } = renderPracticePage()
      const textbox = await screen.findByLabelText(i18n.t(label))
      const content = "第一次提交失败后必须保留的完整回答。"
      await user.type(textbox, content)
      // A successful same-question refresh must also retain the draft.
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ["practices"] })
      })
      expect(textbox).toHaveValue(content)
      const button = screen.getByRole("button", { name: i18n.t(submit) })
      act(() => {
        fireEvent.click(button)
        fireEvent.click(button)
      })
      await waitFor(() => expect(api.submitPracticeAnswer).toHaveBeenCalledTimes(1))
      expect(api.submitPracticeAnswer).toHaveBeenCalledWith(practice.id, practice.rounds[0].id, {
        questionId: practice.rounds[0].turns[questionIndex].id,
        content,
      })
      await act(async () => {
        submission.reject(new Error("unsafe details"))
        await submission.promise.catch(() => undefined)
      })
      expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t(error))
      expect(textbox).toHaveValue(content)
      act(() => {
        void router?.navigate({ to: "/profile" })
      })
      expect(await screen.findByText(i18n.t(leave))).toBeInTheDocument()
      expect(router?.state.location.pathname).toBe("/practice")
    },
  )
})
