import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/error"
import type {
  PracticeResponse,
  TaskFailureResponse,
  TaskStatusResponse,
} from "@/api/generated/models"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import {
  careerProfileFixture,
  incompleteCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"
import { practiceResponseFixture, practiceTaskFailureFixture } from "@/mocks/fixtures/practice"
import { roleFixture, roleListFixture, secondaryRoleFixture } from "@/mocks/fixtures/role"
import { PracticePage } from "@/pages/practice"
import { practiceQueryKeys } from "@/pages/practice/queries"
import * as practiceService from "@/services/practices"
import * as profileService from "@/services/profile"
import * as roleService from "@/services/roles"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/practices", () => ({
  getActivePractice: vi.fn(),
  getPractice: vi.fn(),
  getPracticeRound: vi.fn(),
  getPracticeTaskState: vi.fn(),
  createPractice: vi.fn(),
  submitPracticeAnswer: vi.fn(),
  skipPracticeRound: vi.fn(),
  finishPracticeRound: vi.fn(),
  restartPracticeRound: vi.fn(),
  startNextPracticeRound: vi.fn(),
  endPracticeSession: vi.fn(),
  retryPracticeTask: vi.fn(),
  deletePractice: vi.fn(),
}))
vi.mock("@/services/profile", () => ({ getCareerProfile: vi.fn() }))
vi.mock("@/services/roles", () => ({ listRoles: vi.fn() }))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function practiceAt(
  stage: "generating" | "answering" | "processing" | "followUp" | "review" | "completed",
) {
  const practice = structuredClone(practiceResponseFixture)
  practice.role = { id: roleFixture.id, title: roleFixture.title, company: roleFixture.company }
  const round = practice.rounds[0]
  if (stage !== "review" && stage !== "completed") round.result = null
  if (stage === "generating") round.turns = []
  if (stage === "answering") round.turns = round.turns.slice(0, 1)
  if (stage === "processing") round.turns = round.turns.slice(0, 2)
  if (stage === "followUp") round.turns = round.turns.slice(0, 3)
  if (stage === "completed") practice.endedAt = "2026-09-18T09:00:00Z"
  return practice
}

function mockPractice(
  practice: PracticeResponse | null,
  task: TaskStatusResponse | TaskFailureResponse = { status: "idle", error: null },
) {
  vi.mocked(practiceService.getActivePractice).mockImplementation(async () =>
    practice?.endedAt === null ? structuredClone(practice) : undefined,
  )
  vi.mocked(practiceService.getPractice).mockImplementation(async () => {
    if (!practice) throw new Error("Missing fixture.")
    return structuredClone(practice)
  })
  vi.mocked(practiceService.getPracticeRound).mockImplementation(async () => {
    if (!practice) throw new Error("Missing fixture.")
    return structuredClone(practice.rounds.at(-1)!)
  })
  vi.mocked(practiceService.getPracticeTaskState).mockResolvedValue(task)
}

function renderPage(initialEntry = "/practice") {
  return renderWithProviders(<PracticePage />, { router: { initialEntries: [initialEntry] } })
}

describe("PracticePage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    for (const mock of [
      practiceService.getActivePractice,
      practiceService.getPractice,
      practiceService.getPracticeRound,
      practiceService.getPracticeTaskState,
      practiceService.createPractice,
      practiceService.submitPracticeAnswer,
      practiceService.skipPracticeRound,
      practiceService.finishPracticeRound,
      practiceService.restartPracticeRound,
      practiceService.startNextPracticeRound,
      practiceService.endPracticeSession,
      practiceService.retryPracticeTask,
      practiceService.deletePractice,
      profileService.getCareerProfile,
      roleService.listRoles,
    ]) {
      vi.mocked(mock).mockReset()
    }
    vi.mocked(roleService.listRoles).mockResolvedValue(structuredClone(roleListFixture))
    vi.mocked(profileService.getCareerProfile).mockResolvedValue(
      structuredClone(careerProfileFixture),
    )
    mockPractice(null)
  })

  it("shows structured loading content while active-practice discovery is pending", async () => {
    vi.mocked(practiceService.getActivePractice).mockReturnValue(new Promise(() => undefined))
    renderPage()

    expect(await screen.findByTestId("practice-loading-state")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: i18n.t("practice.setup.title") }),
    ).toBeInTheDocument()
  })

  it("retries a load error without exposing service details", async () => {
    vi.mocked(practiceService.getActivePractice).mockRejectedValueOnce(new Error("unsafe details"))
    renderPage()

    expect(await screen.findByRole("alert")).not.toHaveTextContent("unsafe details")
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )

    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    expect(practiceService.createPractice).not.toHaveBeenCalled()
  })

  it.each([
    ["missing", null, "practice-profile-required-state"],
    ["incomplete", incompleteCareerProfileFixture, "practice-setup-state"],
  ] as const)(
    "uses Profile existence, not completeness, as the setup prerequisite for %s",
    async (_, profile, testId) => {
      vi.mocked(profileService.getCareerProfile).mockResolvedValue(
        profile ? structuredClone(profile) : null,
      )
      renderPage()

      expect(await screen.findByTestId(testId)).toBeInTheDocument()
    },
  )

  it.each(["missing", "error"] as const)(
    "restores an active practice when the career profile request is %s",
    async (profileState) => {
      mockPractice(practiceAt("answering"))
      if (profileState === "missing") {
        vi.mocked(profileService.getCareerProfile).mockResolvedValue(null)
      } else {
        vi.mocked(profileService.getCareerProfile).mockRejectedValue(
          new Error("profile unavailable"),
        )
      }
      renderPage()

      expect(await screen.findByTestId("practice-answering-state")).toBeInTheDocument()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    },
  )

  it("keeps polling queued and running tasks until the question is committed", async () => {
    const generating = practiceAt("generating")
    const answering = practiceAt("answering")
    mockPractice(generating)
    vi.mocked(practiceService.getPracticeTaskState)
      .mockResolvedValueOnce({ status: "queued", error: null })
      .mockResolvedValueOnce({ status: "running", error: null })
      .mockImplementation(async () => {
        vi.mocked(practiceService.getPracticeRound).mockResolvedValue(answering.rounds[0])
        return { status: "idle", error: null }
      })
    renderPage()

    expect(await screen.findByTestId("practice-generating-state")).toBeInTheDocument()
    expect(
      await screen.findByTestId("practice-answering-state", {}, { timeout: 4000 }),
    ).toHaveTextContent(answering.rounds[0].turns[0].content)
    expect(practiceService.getPracticeTaskState).toHaveBeenCalledWith(
      generating.id,
      generating.rounds[0].id,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("submits the exact answer once and reads processing and follow-up states", async () => {
    const user = userEvent.setup()
    const answering = practiceAt("answering")
    const processing = practiceAt("processing")
    const content = "我负责定位问题并推动方案落地。"
    processing.rounds[0].turns[1].content = content
    const following = practiceAt("followUp")
    following.rounds[0].turns[1].content = content
    mockPractice(answering)
    const submission = createDeferred<void>()
    vi.mocked(practiceService.submitPracticeAnswer).mockImplementation(async () => {
      await submission.promise
      mockPractice(processing, { status: "running", error: null })
    })
    const { queryClient } = renderPage()
    await user.type(await screen.findByLabelText(i18n.t("practice.answer.label")), content)
    const button = screen.getByRole("button", { name: i18n.t("practice.answer.submit") })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await waitFor(() => expect(practiceService.submitPracticeAnswer).toHaveBeenCalledTimes(1))
    expect(practiceService.submitPracticeAnswer).toHaveBeenCalledWith(
      answering.id,
      answering.rounds[0].id,
      { questionId: answering.rounds[0].turns[0].id, content },
    )
    await act(async () => {
      submission.resolve()
      await submission.promise
    })
    expect(await screen.findByTestId("practice-processing-status")).toBeInTheDocument()
    expect(screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(content)
    mockPractice(following)
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: practiceQueryKeys.all })
    })
    expect(await screen.findByTestId("practice-answering-follow-up-state")).toBeInTheDocument()
  })

  it("abandons an answering session through DELETE and returns to setup", async () => {
    const user = userEvent.setup()
    const active = practiceAt("answering")
    mockPractice(active)
    vi.mocked(practiceService.deletePractice).mockImplementation(async () => {
      mockPractice(null)
    })
    const { queryClient } = renderPage()

    expect(await screen.findByTestId("practice-answering-state")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: i18n.t("practice.abandon.action") }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("practice.abandon.confirm") }),
    )

    await waitFor(() => expect(practiceService.deletePractice).toHaveBeenCalledWith(active.id))
    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    expect(queryClient.getQueryData(practiceQueryKeys.active())).toBeNull()
    expect(queryClient.getQueryData(practiceQueryKeys.detail(active.id))).toBeUndefined()
    expect(
      queryClient.getQueryData(practiceQueryKeys.task(active.id, active.rounds[0].id)),
    ).toBeUndefined()
  })

  it.each([
    ["generating", "practice-generating-state"],
    ["processing", "practice-processing-state"],
  ] as const)("allows abandoning while the %s task is running", async (stage, testId) => {
    const user = userEvent.setup()
    const active = practiceAt(stage)
    mockPractice(active, { status: "running", error: null })
    vi.mocked(practiceService.deletePractice).mockImplementation(async () => {
      mockPractice(null)
    })
    renderPage()

    expect(await screen.findByTestId(testId)).toBeInTheDocument()
    const abandon = screen.getByRole("button", { name: i18n.t("practice.abandon.action") })
    expect(abandon).toBeEnabled()
    await user.click(abandon)
    const dialog = screen.getByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("practice.abandon.confirm") }),
    )

    await waitFor(() => expect(practiceService.deletePractice).toHaveBeenCalledWith(active.id))
    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
  })

  it("keeps the active session when abandoning fails", async () => {
    const user = userEvent.setup()
    const active = practiceAt("answering")
    mockPractice(active)
    vi.mocked(practiceService.deletePractice).mockRejectedValue(new Error("private delete detail"))
    renderPage()

    expect(await screen.findByTestId("practice-answering-state")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: i18n.t("practice.abandon.action") }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("practice.abandon.confirm") }),
    )

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.abandonDescription"),
    )
    expect(within(dialog).queryByText("private delete detail")).not.toBeInTheDocument()
    expect(screen.getByTestId("practice-answering-state")).toBeInTheDocument()
    expect(practiceService.deletePractice).toHaveBeenCalledWith(active.id)
  })

  it.each([0, 1, 2])(
    "loads the committed review after %s follow-ups without predicting the next step",
    async (count) => {
      const processing = practiceAt("processing")
      const review = practiceAt("review")
      for (let n = 0; n < count; n++)
        processing.rounds[0].turns.push(...structuredClone(review.rounds[0].turns.slice(2)))
      mockPractice(processing, { status: "running", error: null })
      vi.mocked(practiceService.getPracticeTaskState)
        .mockResolvedValueOnce({ status: "running", error: null })
        .mockImplementation(async () => {
          vi.mocked(practiceService.getPracticeRound).mockResolvedValue(review.rounds[0])
          return { status: "idle", error: null }
        })
      renderPage()

      expect(await screen.findByTestId("practice-processing-status")).toBeInTheDocument()
      expect(
        await screen.findByTestId("practice-review-state", {}, { timeout: 3000 }),
      ).toHaveTextContent("78")
    },
  )

  it("retries a failed backend task while preserving the committed conversation", async () => {
    const processing = practiceAt("processing")
    mockPractice(processing, practiceTaskFailureFixture)
    const retry = createDeferred<void>()
    vi.mocked(practiceService.retryPracticeTask).mockImplementation(async () => {
      await retry.promise
      mockPractice(practiceAt("review"))
    })
    renderPage()

    expect(await screen.findByTestId("practice-task-failure")).toBeInTheDocument()
    expect(screen.getByTestId("practice-conversation-timeline")).toHaveTextContent(
      processing.rounds[0].turns[1].content,
    )
    const button = screen.getByRole("button", { name: i18n.t("practice.taskFailure.retry") })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await waitFor(() => expect(practiceService.retryPracticeTask).toHaveBeenCalledTimes(1))
    expect(practiceService.retryPracticeTask).toHaveBeenCalledWith(
      processing.id,
      processing.rounds[0].id,
    )
    await act(async () => {
      retry.resolve()
      await retry.promise
    })
    expect(await screen.findByTestId("practice-review-state")).toBeInTheDocument()
  })

  it.each(["answering", "review"] as const)(
    "restores an active %s session instead of preparing a history entry",
    async (stage) => {
      mockPractice(practiceAt(stage))
      renderPage(
        "/practice?entry=history&roleId=" +
          roleFixture.id +
          "&questionType=behavioral&difficulty=hard",
      )

      expect(await screen.findByTestId("practice-active-session-notice")).toBeInTheDocument()
      expect(screen.queryByTestId("practice-setup-state")).not.toBeInTheDocument()
      expect(practiceService.createPractice).not.toHaveBeenCalled()
      expect(practiceService.deletePractice).not.toHaveBeenCalled()
    },
  )

  it("applies history settings only after confirming there is no active practice", async () => {
    mockPractice(null)
    const generating = practiceAt("generating")
    vi.mocked(practiceService.createPractice).mockImplementation(async () => {
      mockPractice(generating, { status: "queued", error: null })
      return { id: generating.id }
    })
    const { queryClient } = renderPage(
      "/practice?entry=history&roleId=" +
        roleFixture.id +
        "&questionType=behavioral&difficulty=hard",
    )
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    expect(await screen.findByTestId("history-entry-available")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: i18n.t("practice.actions.start") }))
    await waitFor(() =>
      expect(practiceService.createPractice).toHaveBeenCalledWith({
        roleId: roleFixture.id,
        questionType: "behavioral",
        difficulty: "hard",
      }),
    )
    expect(await screen.findByTestId("practice-generating-state")).toBeInTheDocument()
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: practiceQueryKeys.active(),
      exact: true,
    })
  })

  it.each([
    ["deleted", roleListFixture, "deleted", /ByteDance/],
    [
      "archived",
      {
        roles: [{ ...roleFixture, isArchived: true }, secondaryRoleFixture],
        activeRoleId: secondaryRoleFixture.id,
      },
      roleFixture.id,
      /Product Manager/,
    ],
  ])(
    "keeps a %s historical role unselected until a role is chosen",
    async (reason, roles, roleId, option) => {
      vi.mocked(roleService.listRoles).mockResolvedValue(structuredClone(roles))
      renderPage("/practice?entry=history&roleId=" + roleId + "&questionType=project")

      expect(await screen.findByTestId("history-entry-role-unavailable")).toBeInTheDocument()
      const start = screen.getByRole("button", { name: i18n.t("practice.actions.start") })
      expect(start).toBeDisabled()
      await userEvent.click(screen.getByTestId("practice-role-trigger"))
      await userEvent.click(await screen.findByRole("option", { name: option }))
      expect(start).toBeEnabled()
      expect(reason).toMatch(/deleted|archived/)
    },
  )

  it("retries history preparation reads without exposing the raw error", async () => {
    vi.mocked(roleService.listRoles)
      .mockRejectedValueOnce(new Error("prepare failed"))
      .mockResolvedValue(structuredClone(roleListFixture))
    renderPage("/practice?entry=history&roleId=" + roleFixture.id)

    expect(await screen.findByTestId("history-entry-failed")).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.trainingEntry.failed.retry") }),
    )
    expect(await screen.findByTestId("history-entry-available")).toBeInTheDocument()
  })

  it("does not apply historical settings during ordinary access", async () => {
    renderPage()

    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    expect(screen.queryByTestId("history-entry-available")).not.toBeInTheDocument()
  })

  it("refreshes Profile, roles, and active practice after a not-found start response", async () => {
    vi.mocked(practiceService.createPractice).mockRejectedValue(
      new ApiError({
        error: {
          code: "resource.not_found",
          message: "Practice prerequisite changed.",
          issues: [],
        },
      }),
    )
    renderPage()

    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("practice.actions.start") }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.startDescription"),
    )
    expect(profileService.getCareerProfile).toHaveBeenCalledTimes(2)
    expect(roleService.listRoles).toHaveBeenCalledTimes(2)
    expect(practiceService.getActivePractice).toHaveBeenCalledTimes(2)
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
          ? practiceService.restartPracticeRound
          : action === "next"
            ? practiceService.startNextPracticeRound
            : practiceService.endPracticeSession
      vi.mocked(method).mockImplementation(async () => {
        await deferred.promise
        mockPractice(next, { status: action === "end" ? "idle" : "queued", error: null })
      })
      const { queryClient } = renderPage()
      const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")
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
          expect(practiceService.getPracticeTaskState).toHaveBeenCalledWith(
            next.id,
            next.rounds[0].id,
            expect.anything(),
          ),
        )
      }
      if (action === "end") {
        expect(invalidateQueries).toHaveBeenCalledWith({
          queryKey: practiceQueryKeys.active(),
          exact: true,
        })
      }
    },
  )

  it("returns to setup with the completed selection without creating another session", async () => {
    const completed = practiceAt("completed")
    completed.questionType = "behavioral"
    completed.difficulty = "hard"
    mockPractice(practiceAt("review"))
    vi.mocked(practiceService.endPracticeSession).mockImplementation(async () => {
      mockPractice(completed)
    })
    const { queryClient } = renderPage()
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
    vi.mocked(practiceService.getActivePractice).mockImplementation(async () => {
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
    expect(queryClient.getQueryData(practiceQueryKeys.active())).toBeNull()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.behavioral") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: i18n.t("practice.difficulty.hard") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(practiceService.createPractice).not.toHaveBeenCalled()
  })
})
