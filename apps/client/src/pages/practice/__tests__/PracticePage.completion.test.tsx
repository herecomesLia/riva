import * as testing from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"

import "./practice-page-service-mock"
import { PRACTICE_QUERY_KEY } from "../hooks/usePracticeSession"
import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: completion", () => {
  it.each(["answeringQuestion", "completedSession"] as const)(
    "prepares a fresh history setup from an existing %s session",
    async (scenario) => {
      const current = api.createPracticeScenario(scenario)
      const prepared = api.createPracticeScenario("setupReady")
      if (prepared.session.status !== "setup") throw new Error("Expected setup state.")
      const productRole = prepared.setupContext.targetRoles.find(
        ({ id }) => id === "role_product_manager_meituan",
      )
      if (productRole === undefined) throw new Error("Expected product role.")
      prepared.session.selection = {
        targetRoleId: productRole.id,
        questionType: "behavioral",
        difficulty: "pressure",
        source: "history",
        prioritizeWeaknesses: true,
      }
      vi.mocked(api.getPracticePage).mockResolvedValue(current)
      vi.mocked(api.preparePracticeTrainingEntry).mockResolvedValue({
        page: prepared,
        resolution: {
          status: "available",
          configuration: prepared.session.selection,
          adjustments: [],
        },
      })

      context.renderPracticePage(
        "/practice?entry=history&targetRoleId=role_product_manager_meituan&questionType=behavioral&difficulty=pressure&source=history&prioritizeWeaknesses=true",
      )

      expect(await testing.screen.findByTestId("practice-setup-state")).toBeInTheDocument()
      expect(vi.mocked(api.preparePracticeTrainingEntry).mock.calls[0]?.[0]).toEqual({
        targetRoleId: "role_product_manager_meituan",
        questionType: "behavioral",
        difficulty: "pressure",
        source: "history",
        prioritizeWeaknesses: true,
      })
      expect(testing.screen.getByTestId("practice-target-role-trigger")).toHaveTextContent(
        "Product Manager",
      )
      expect(
        testing.screen.getByRole("button", {
          name: i18n.t("practice.questionTypes.behavioral"),
        }),
      ).toHaveAttribute("aria-pressed", "true")
      expect(
        testing.screen.getByRole("button", { name: i18n.t("practice.difficulty.pressure") }),
      ).toHaveAttribute("aria-pressed", "true")
      expect(
        testing.screen.getByRole("button", { name: i18n.t("practice.sources.history") }),
      ).toHaveAttribute("aria-pressed", "true")
      expect(
        testing.screen.getByRole("switch", {
          name: i18n.t("practice.setup.fields.prioritizeWeaknesses"),
        }),
      ).toBeChecked()
    },
  )

  it("requires confirmation when a historical question type is adjusted", async () => {
    const user = userEvent.setup()
    const current = api.createPracticeScenario("answeringQuestion")
    const prepared = api.createPracticeScenario("setupReady")
    if (prepared.session.status !== "setup") throw new Error("Expected setup state.")
    const productRole = prepared.setupContext.targetRoles.find(
      ({ id }) => id === "role_product_manager_meituan",
    )!
    prepared.session.selection = {
      ...prepared.session.selection,
      targetRoleId: productRole.id,
      questionType: productRole.supportedQuestionTypes[0],
      source: "history",
    }
    const generating = api.createPracticeScenario("generatingQuestion")
    if (generating.session.status !== "generatingQuestion") {
      throw new Error("Expected generating state.")
    }
    generating.session.selection = {
      ...prepared.session.selection,
      targetRoleId: productRole.id,
    }
    vi.mocked(api.getPracticePage).mockResolvedValue(current)
    vi.mocked(api.preparePracticeTrainingEntry).mockResolvedValue({
      page: prepared,
      resolution: {
        status: "adjusted",
        configuration: prepared.session.selection,
        adjustments: ["practiceQuestionTypeUnsupported"],
      },
    })
    vi.mocked(api.startPracticeSession).mockResolvedValue(generating.session)

    context.renderPracticePage(
      "/practice?entry=history&targetRoleId=role_product_manager_meituan&questionType=technicalFoundation&difficulty=basic&source=history",
    )

    expect(await testing.screen.findByTestId("history-entry-adjusted")).toHaveTextContent(
      i18n.t("common.trainingEntry.adjustments.practiceQuestionTypeUnsupported"),
    )
    const start = testing.screen.getByRole("button", { name: i18n.t("practice.actions.start") })
    expect(start).toBeDisabled()
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("common.trainingEntry.adjusted.confirm"),
      }),
    )
    expect(start).toBeEnabled()
    await user.click(start)
    expect(api.startPracticeSession).toHaveBeenCalledOnce()
  })

  it("keeps an unavailable historical role unselected until the user chooses one", async () => {
    const user = userEvent.setup()
    const current = api.createPracticeScenario("answeringQuestion")
    const prepared = api.createPracticeScenario("setupReady")
    if (prepared.session.status !== "setup") throw new Error("Expected setup state.")
    prepared.session.selection = {
      ...prepared.session.selection,
      targetRoleId: null,
      source: "history",
    }
    const generating = api.createPracticeScenario("generatingQuestion")
    vi.mocked(api.getPracticePage).mockResolvedValue(current)
    vi.mocked(api.preparePracticeTrainingEntry).mockResolvedValue({
      page: prepared,
      resolution: {
        status: "roleUnavailable",
        reason: "targetRoleDeleted",
        configuration: prepared.session.selection,
      },
    })
    vi.mocked(api.startPracticeSession).mockResolvedValue(generating.session)

    context.renderPracticePage(
      "/practice?entry=history&targetRoleId=role_deleted&questionType=projectDeepDive&difficulty=basic&source=history",
    )

    expect(await testing.screen.findByTestId("history-entry-role-unavailable")).toHaveTextContent(
      i18n.t("common.trainingEntry.roleUnavailable.reasons.targetRoleDeleted"),
    )
    const start = testing.screen.getByRole("button", { name: i18n.t("practice.actions.start") })
    expect(start).toBeDisabled()
    expect(testing.screen.getByTestId("practice-target-role-trigger")).toHaveTextContent(
      i18n.t("common.trainingEntry.selectRole"),
    )

    await user.click(testing.screen.getByTestId("practice-target-role-trigger"))
    await user.click(await testing.screen.findByRole("option", { name: /ByteDance/ }))
    expect(start).toBeEnabled()
    await user.click(start)
    expect(vi.mocked(api.startPracticeSession).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ targetRoleId: "role_frontend_bytedance" }),
    )
  })

  it("shows a dedicated preparation failure and retries the entry", async () => {
    const user = userEvent.setup()
    const current = api.createPracticeScenario("completedSession")
    const prepared = api.createPracticeScenario("setupReady")
    if (prepared.session.status !== "setup") throw new Error("Expected setup state.")
    vi.mocked(api.getPracticePage).mockResolvedValue(current)
    vi.mocked(api.preparePracticeTrainingEntry)
      .mockRejectedValueOnce(new Error("prepare failed"))
      .mockResolvedValueOnce({
        page: prepared,
        resolution: {
          status: "available",
          configuration: prepared.session.selection,
          adjustments: [],
        },
      })

    context.renderPracticePage(
      "/practice?entry=history&targetRoleId=role_frontend_bytedance&questionType=projectDeepDive",
    )
    expect(await testing.screen.findByTestId("history-entry-failed")).toBeInTheDocument()
    await user.click(
      testing.screen.getByRole("button", {
        name: i18n.t("common.trainingEntry.failed.retry"),
      }),
    )
    expect(await testing.screen.findByTestId("history-entry-available")).toBeInTheDocument()
  })

  it("does not prepare a historical entry during ordinary practice access", async () => {
    const prepared = api.createPracticeScenario("setupReady")
    vi.mocked(api.getPracticePage).mockResolvedValue(prepared)
    context.renderPracticePage("/practice")
    expect(await testing.screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    expect(api.preparePracticeTrainingEntry).not.toHaveBeenCalled()
  })

  it("synchronously locks duplicate retry-current clicks", async () => {
    const review = api.createPracticeScenario("reviewBalanced")
    const retrying = api.createPracticeScenario("retryingCurrentQuestion")
    if (review.session.status !== "review" || retrying.session.status !== "answering") return

    const deferred = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(review)
    vi.mocked(api.retryCurrentPracticeQuestion).mockReturnValue(deferred.promise)
    context.renderPracticePage()
    const retryButton = await testing.screen.findByRole("button", { name: /重练当前题/i })
    testing.act(() => {
      testing.fireEvent.click(retryButton)
      testing.fireEvent.click(retryButton)
    })
    await testing.waitFor(() => expect(api.retryCurrentPracticeQuestion).toHaveBeenCalledTimes(1))
    expect(testing.screen.queryByRole("alert")).not.toBeInTheDocument()
    await testing.act(async () => {
      deferred.resolve(retrying.session)
      await deferred.promise
    })
    expect(await testing.screen.findByTestId("practice-answering-state")).toBeInTheDocument()
  })

  it("synchronously locks duplicate next-question clicks", async () => {
    const review = api.createPracticeScenario("reviewBalanced")
    const generating = api.createPracticeScenario("generatingNextQuestion")
    if (review.session.status !== "review" || generating.session.status !== "generatingQuestion")
      return

    const deferred = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(review)
    vi.mocked(api.getQuestionGenerationStatus).mockResolvedValue(generating.session)
    vi.mocked(api.continueToNextPracticeQuestion).mockReturnValue(deferred.promise)
    context.renderPracticePage()
    const nextButton = await testing.screen.findByRole("button", { name: /继续下一题/i })
    testing.act(() => {
      testing.fireEvent.click(nextButton)
      testing.fireEvent.click(nextButton)
    })
    await testing.waitFor(() => expect(api.continueToNextPracticeQuestion).toHaveBeenCalledTimes(1))
    expect(testing.screen.queryByRole("alert")).not.toBeInTheDocument()
    await testing.act(async () => {
      deferred.resolve(generating.session)
      await deferred.promise
    })
    expect(await testing.screen.findByTestId("practice-generating-state")).toBeInTheDocument()
  })

  it("synchronously locks duplicate end confirmations", async () => {
    const user = userEvent.setup()
    const review = api.createPracticeScenario("reviewBalanced")
    const completed = api.createPracticeScenario("completedSession")
    if (review.session.status !== "review" || completed.session.status !== "completed") return

    const deferred = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(review)
    vi.mocked(api.endPracticeSession).mockReturnValue(deferred.promise)
    context.renderPracticePage()
    await user.click(await testing.screen.findByRole("button", { name: /结束本轮练习/i }))
    const confirm = testing.screen.getAllByRole("button", { name: /结束本轮练习/i }).at(-1)!
    testing.act(() => {
      testing.fireEvent.click(confirm)
      testing.fireEvent.click(confirm)
    })
    await testing.waitFor(() => expect(api.endPracticeSession).toHaveBeenCalledTimes(1))
    await testing.act(async () => {
      deferred.resolve(completed.session)
      await deferred.promise
    })
    expect(await testing.screen.findByTestId("practice-completed-state")).toBeInTheDocument()
  })

  it("prepares the next round from the completed snapshot and restores the saved setup", async () => {
    const user = userEvent.setup()
    const completed = api.createPracticeScenario("completedSession")
    const prepared = api.createPracticeScenario("setupReady")
    if (completed.session.status !== "completed" || prepared.session.status !== "setup") return
    completed.session.selection = {
      ...completed.session.selection,
      difficulty: "pressure",
      questionType: "behavioral",
      prioritizeWeaknesses: true,
      source: "saved",
    }
    prepared.setupContext = structuredClone(completed.setupContext)
    prepared.session.selection = structuredClone(completed.session.selection)
    vi.mocked(api.getPracticePage).mockResolvedValue(completed)
    vi.mocked(api.prepareNextPracticeSession).mockResolvedValue(prepared.session)
    const result = context.renderPracticePage()

    await user.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.completed.startNextRound"),
      }),
    )

    expect(result.queryClient.getQueryData(PRACTICE_QUERY_KEY)).toEqual(prepared)
    expect(await testing.screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    expect(testing.screen.getByTestId("practice-target-role-trigger")).toHaveTextContent(
      completed.setupContext.targetRoles.find(
        (role) => role.id === completed.session.selection.targetRoleId,
      )?.title ?? "",
    )
    expect(
      testing.screen.getByRole("button", {
        name: i18n.t(`practice.questionTypes.${completed.session.selection.questionType}`),
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      testing.screen.getByRole("button", {
        name: i18n.t(`practice.difficulty.${completed.session.selection.difficulty}`),
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      testing.screen.getByRole("button", {
        name: i18n.t(`practice.sources.${completed.session.selection.source}`),
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      testing.screen.getByRole("switch", {
        name: i18n.t("practice.setup.fields.prioritizeWeaknesses"),
      }),
    ).toBeChecked()
    expect(testing.screen.queryByTestId("practice-completed-state")).not.toBeInTheDocument()
  })

  it("synchronously prevents duplicate prepare-next-round requests", async () => {
    const completed = api.createPracticeScenario("completedSession")
    const prepared = api.createPracticeScenario("setupReady")
    if (completed.session.status !== "completed") return
    const deferred = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(completed)
    vi.mocked(api.prepareNextPracticeSession).mockReturnValue(deferred.promise)
    context.renderPracticePage()

    const startNextRound = await testing.screen.findByRole("button", {
      name: i18n.t("practice.completed.startNextRound"),
    })
    testing.act(() => {
      testing.fireEvent.click(startNextRound)
      testing.fireEvent.click(startNextRound)
    })

    await testing.waitFor(() => expect(api.prepareNextPracticeSession).toHaveBeenCalledTimes(1))
    expect(testing.screen.queryByRole("alert")).not.toBeInTheDocument()
    await testing.act(async () => {
      deferred.resolve(prepared.session)
      await deferred.promise
    })
    expect(await testing.screen.findByTestId("practice-setup-state")).toBeInTheDocument()
  })

  it("shows a pending next-round action and disables both completed actions", async () => {
    const completed = api.createPracticeScenario("completedSession")
    const deferred = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    vi.mocked(api.getPracticePage).mockResolvedValue(completed)
    vi.mocked(api.prepareNextPracticeSession).mockReturnValue(deferred.promise)
    context.renderPracticePage()

    await userEvent.click(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.completed.startNextRound"),
      }),
    )

    expect(
      await testing.screen.findByRole("button", {
        name: i18n.t("practice.completed.preparingNextRound"),
      }),
    ).toBeDisabled()
    expect(
      testing.screen.getByTestId("practice-completed-state").querySelector('[data-slot="spinner"]'),
    ).toBeVisible()
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.completed.viewHistory") }),
    ).toHaveAttribute("aria-disabled", "true")
    expect(api.prepareNextPracticeSession).toHaveBeenCalledOnce()
  })

  it("shows a safe error and allows retrying the next-round preparation", async () => {
    const user = userEvent.setup()
    const completed = api.createPracticeScenario("completedSession")
    const prepared = api.createPracticeScenario("setupReady")
    const internalError = "internal request detail stack"
    vi.mocked(api.getPracticePage).mockResolvedValue(completed)
    vi.mocked(api.prepareNextPracticeSession)
      .mockRejectedValueOnce(new Error(internalError))
      .mockResolvedValueOnce(prepared.session)
    context.renderPracticePage()

    const startNextRound = await testing.screen.findByRole("button", {
      name: i18n.t("practice.completed.startNextRound"),
    })
    await user.click(startNextRound)

    const alert = await testing.screen.findByRole("alert")
    expect(alert).toHaveTextContent(i18n.t("practice.errors.prepareNextRoundTitle"))
    expect(alert).toHaveTextContent(i18n.t("practice.errors.prepareNextRoundDescription"))
    expect(alert).not.toHaveTextContent(internalError)
    expect(testing.screen.getByTestId("practice-completed-state")).toBeInTheDocument()
    expect(startNextRound).toBeEnabled()
    expect(
      testing.screen.getByRole("button", { name: i18n.t("practice.completed.viewHistory") }),
    ).not.toHaveAttribute("aria-disabled")

    await user.click(startNextRound)
    expect(api.prepareNextPracticeSession).toHaveBeenCalledTimes(2)
    expect(testing.screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(await testing.screen.findByTestId("practice-setup-state")).toBeInTheDocument()
  })

  it("locks every review action while next-question is pending", async () => {
    const review = api.createPracticeScenario("reviewBalanced")
    const generating = api.createPracticeScenario("generatingNextQuestion")
    const deferred = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    if (review.session.status !== "review" || generating.session.status !== "generatingQuestion")
      return

    vi.mocked(api.getPracticePage).mockResolvedValue(review)
    vi.mocked(api.getQuestionGenerationStatus).mockResolvedValue(generating.session)
    vi.mocked(api.continueToNextPracticeQuestion).mockReturnValue(deferred.promise)
    context.renderPracticePage()
    const nextButton = await testing.screen.findByRole("button", { name: /继续下一题/i })
    const retryButton = testing.screen.getByRole("button", { name: /重练当前题/i })
    const endButton = testing.screen.getByRole("button", { name: /结束本轮练习/i })
    const savedButton = testing.screen.getByRole("button", { name: /收藏题目/i })
    const weakButton = testing.screen.getByRole("button", { name: /标记(为)?薄弱题/i })
    testing.act(() => {
      testing.fireEvent.click(nextButton)
      testing.fireEvent.click(retryButton)
      testing.fireEvent.click(endButton)
      testing.fireEvent.click(savedButton)
      testing.fireEvent.click(weakButton)
    })
    await testing.waitFor(() => expect(api.continueToNextPracticeQuestion).toHaveBeenCalledTimes(1))
    for (const name of [/重练当前题/i, /结束本轮练习/i, /收藏题目/i, /标记(为)?薄弱题/i]) {
      for (const button of testing.screen.getAllByRole("button", { hidden: true, name })) {
        expect(button).toBeDisabled()
      }
    }
    expect(api.retryCurrentPracticeQuestion).not.toHaveBeenCalled()
    expect(api.endPracticeSession).not.toHaveBeenCalled()
    expect(api.setQuestionSaved).not.toHaveBeenCalled()
    expect(api.setQuestionWeak).not.toHaveBeenCalled()
    await testing.act(async () => {
      deferred.resolve(generating.session)
      await deferred.promise
    })
    expect(await testing.screen.findByTestId("practice-generating-state")).toBeInTheDocument()
  })

  it("locks every review action while retry-current is pending", async () => {
    const review = api.createPracticeScenario("reviewBalanced")
    const retrying = api.createPracticeScenario("retryingCurrentQuestion")
    const deferred = context.createDeferred<import("@/models/practice-workflow").PracticeSession>()
    if (review.session.status !== "review" || retrying.session.status !== "answering") return

    vi.mocked(api.getPracticePage).mockResolvedValue(review)
    vi.mocked(api.retryCurrentPracticeQuestion).mockReturnValue(deferred.promise)
    context.renderPracticePage()
    const retryButton = await testing.screen.findByRole("button", { name: /重练当前题/i })
    const nextButton = testing.screen.getByRole("button", { name: /继续下一题/i })
    const endButton = testing.screen.getByRole("button", { name: /结束本轮练习/i })
    const savedButton = testing.screen.getByRole("button", { name: /收藏题目/i })
    const weakButton = testing.screen.getByRole("button", { name: /标记(为)?薄弱题/i })
    testing.act(() => {
      testing.fireEvent.click(retryButton)
      testing.fireEvent.click(nextButton)
      testing.fireEvent.click(endButton)
      testing.fireEvent.click(savedButton)
      testing.fireEvent.click(weakButton)
    })
    await testing.waitFor(() => expect(api.retryCurrentPracticeQuestion).toHaveBeenCalledTimes(1))
    for (const name of [/继续下一题/i, /结束本轮练习/i, /收藏题目/i, /标记(为)?薄弱题/i]) {
      for (const button of testing.screen.getAllByRole("button", { hidden: true, name })) {
        expect(button).toBeDisabled()
      }
    }
    expect(api.continueToNextPracticeQuestion).not.toHaveBeenCalled()
    expect(api.endPracticeSession).not.toHaveBeenCalled()
    expect(api.setQuestionSaved).not.toHaveBeenCalled()
    expect(api.setQuestionWeak).not.toHaveBeenCalled()
    await testing.act(async () => {
      deferred.resolve(retrying.session)
      await deferred.promise
    })
    expect(await testing.screen.findByTestId("practice-answering-state")).toBeInTheDocument()
  })
})
