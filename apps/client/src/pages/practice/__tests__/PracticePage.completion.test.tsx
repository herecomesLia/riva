import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"
import { roleFixture, roleListFixture } from "@/mocks/fixtures/role"
import { practiceSessionOptions } from "../hooks/usePracticeSession"
import * as api from "./practice-page-test-api"
import {
  createDeferred,
  mockPractice,
  practiceAt,
  renderPracticePage,
} from "./practice-page-test-utils"

describe("PracticePage: completion and history entry", () => {
  it.each(["answering", "review"] as const)(
    "restores an active %s session instead of overwriting it for a history entry",
    async (stage) => {
      mockPractice(practiceAt(stage))
      renderPracticePage(
        "/practice?entry=history&roleId=" +
          roleFixture.id +
          "&questionType=behavioral&difficulty=hard",
      )
      expect(await screen.findByTestId("practice-active-session-notice")).toBeInTheDocument()
      expect(screen.queryByTestId("practice-setup-state")).not.toBeInTheDocument()
      expect(api.createPractice).not.toHaveBeenCalled()
      expect(api.deletePractice).not.toHaveBeenCalled()
    },
  )

  it("uses history settings only when there is no active session", async () => {
    mockPractice(null)
    const generating = practiceAt("generating")
    vi.mocked(api.createPractice).mockImplementation(async () => {
      mockPractice(generating, { status: "queued", error: null })
      return { id: generating.id }
    })
    renderPracticePage(
      "/practice?entry=history&roleId=" +
        roleFixture.id +
        "&questionType=behavioral&difficulty=hard",
    )
    expect(await screen.findByTestId("history-entry-available")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.behavioral") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: i18n.t("practice.difficulty.hard") }),
    ).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(screen.getByRole("button", { name: i18n.t("practice.actions.start") }))
    await waitFor(() =>
      expect(api.createPractice).toHaveBeenCalledWith({
        roleId: roleFixture.id,
        questionType: "behavioral",
        difficulty: "hard",
      }),
    )
    expect(await screen.findByTestId("practice-generating-state")).toBeInTheDocument()
  })

  it("leaves a deleted historical role unselected until the user chooses one", async () => {
    renderPracticePage("/practice?entry=history&roleId=deleted&questionType=project")
    expect(await screen.findByTestId("history-entry-role-unavailable")).toHaveTextContent(
      i18n.t("common.trainingEntry.roleUnavailable.reasons.roleDeleted"),
    )
    const start = screen.getByRole("button", { name: i18n.t("practice.actions.start") })
    expect(start).toBeDisabled()
    await userEvent.click(screen.getByTestId("practice-role-trigger"))
    await userEvent.click(await screen.findByRole("option", { name: /ByteDance/ }))
    expect(start).toBeEnabled()
  })

  it("shows a dedicated history preparation error and retries its reads", async () => {
    vi.mocked(api.listRoles)
      .mockRejectedValueOnce(new Error("prepare failed"))
      .mockResolvedValue(roleListFixture)
    renderPracticePage("/practice?entry=history&roleId=" + roleFixture.id)
    expect(await screen.findByTestId("history-entry-failed")).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.trainingEntry.failed.retry") }),
    )
    expect(await screen.findByTestId("history-entry-available")).toBeInTheDocument()
  })

  it("does not apply historical settings during ordinary access", async () => {
    renderPracticePage()
    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    expect(screen.queryByTestId("history-entry-available")).not.toBeInTheDocument()
  })

  it.each(["restart", "next", "end"] as const)(
    "locks duplicate %s commands and uses the refreshed round identity",
    async (action) => {
      const review = practiceAt("review")
      mockPractice(review)
      const deferred = createDeferred<void>()
      const next = practiceAt(action === "end" ? "completed" : "generating")
      if (action !== "end") next.rounds[0].id = "30000000-0000-4000-8000-000000000001"
      if (action === "restart") next.rounds[0].turns = review.rounds[0].turns.slice(0, 1)
      const method =
        action === "restart"
          ? api.restartPracticeRound
          : action === "next"
            ? api.startNextPracticeRound
            : api.endPracticeSession
      vi.mocked(method).mockImplementation(async () => {
        await deferred.promise
        mockPractice(next, { status: action === "end" ? "idle" : "queued", error: null })
      })
      renderPracticePage()
      const name = i18n.t(
        action === "restart"
          ? "practice.review.retryCurrent"
          : action === "next"
            ? "practice.review.nextQuestion"
            : "practice.review.endSession",
      )
      let button = await screen.findByRole("button", { name })
      if (action === "end") {
        await userEvent.click(button)
        button = screen.getAllByRole("button", { name }).at(-1)!
      }
      act(() => {
        fireEvent.click(button)
        fireEvent.click(button)
      })
      await waitFor(() => expect(method).toHaveBeenCalledTimes(1))
      expect(method).toHaveBeenCalledWith(review.id, review.rounds[0].id)
      await act(async () => {
        deferred.resolve()
        await deferred.promise
      })
      expect(
        await screen.findByTestId(
          action === "end" ? "practice-completed-state" : "practice-generating-state",
        ),
      ).toBeInTheDocument()
      if (action !== "end") {
        await waitFor(() =>
          expect(api.getPracticeTaskState).toHaveBeenCalledWith(
            next.id,
            next.rounds[0].id,
            expect.anything(),
          ),
        )
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
      }
    },
  )

  it("returns to setup with the completed selection by reading active, without creating a session", async () => {
    const completed = practiceAt("completed")
    completed.questionType = "behavioral"
    completed.difficulty = "hard"
    mockPractice(practiceAt("review"))
    vi.mocked(api.endPracticeSession).mockImplementation(async () => {
      mockPractice(completed)
    })
    const { queryClient } = renderPracticePage()
    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("practice.review.endSession") }),
    )
    await userEvent.click(
      screen.getAllByRole("button", { name: i18n.t("practice.review.endSession") }).at(-1)!,
    )
    const button = await screen.findByRole("button", {
      name: i18n.t("practice.completed.startNextRound"),
    })
    const deferred = createDeferred<void>()
    vi.mocked(api.getActivePractice).mockImplementation(async () => {
      await deferred.promise
    })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    expect(
      await screen.findByRole("button", { name: i18n.t("practice.completed.preparingNextRound") }),
    ).toBeDisabled()
    await act(async () => {
      deferred.resolve()
      await deferred.promise
    })
    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    expect(queryClient.getQueryData(practiceSessionOptions(null).queryKey)).toBeNull()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.behavioral") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: i18n.t("practice.difficulty.hard") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(api.createPractice).not.toHaveBeenCalled()
  })

  it.each(["restart", "next"] as const)(
    "locks every review action while %s is pending",
    async (action) => {
      mockPractice(practiceAt("review"))
      const deferred = createDeferred<void>()
      const method = action === "restart" ? api.restartPracticeRound : api.startNextPracticeRound
      vi.mocked(method).mockReturnValue(deferred.promise)
      renderPracticePage()
      const retry = await screen.findByRole("button", {
        name: i18n.t("practice.review.retryCurrent"),
      })
      const next = screen.getByRole("button", { name: i18n.t("practice.review.nextQuestion") })
      act(() => {
        fireEvent.click(action === "restart" ? retry : next)
        fireEvent.click(action === "restart" ? next : retry)
      })
      await waitFor(() => expect(method).toHaveBeenCalledTimes(1))
      expect(retry).toBeDisabled()
      expect(next).toBeDisabled()
      expect(
        action === "restart" ? api.startNextPracticeRound : api.restartPracticeRound,
      ).not.toHaveBeenCalled()
      await act(async () => {
        deferred.resolve()
        await deferred.promise
      })
    },
  )
})
