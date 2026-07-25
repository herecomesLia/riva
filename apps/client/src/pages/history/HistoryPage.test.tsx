import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { HistoryPage } from "@/pages/history"
import {
  emptyHistoryOverviewStoryFixture,
  emptyHistoryRecordsStoryFixture,
  historyOverviewStoryFixture,
  historyRecordsStoryFixture,
} from "@/pages/history/stories/history-story-fixtures"
import { getTrainingRecordsOverview, listTrainingRecords } from "@/services/training-records"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/training-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/training-records")>()),
  getTrainingRecordsOverview: vi.fn(),
  listTrainingRecords: vi.fn(),
}))

function renderHistoryPage() {
  return renderWithProviders(<HistoryPage />, {
    router: { initialEntries: ["/history"] },
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe("HistoryPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getTrainingRecordsOverview).mockReset()
    vi.mocked(listTrainingRecords).mockReset()
  })

  it("maps pending queries to the stable loading layout", async () => {
    vi.mocked(getTrainingRecordsOverview).mockReturnValue(new Promise(() => undefined))
    vi.mocked(listTrainingRecords).mockReturnValue(new Promise(() => undefined))

    renderHistoryPage()

    expect(
      await screen.findByRole("heading", { level: 1, name: i18n.t("history.title") }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: i18n.t("history.overview.title") }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 2, name: i18n.t("history.filters.title") }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 2, name: i18n.t("history.records.title") }),
    ).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(8)
  })

  it("passes default server query parameters and maps both responses to ready", async () => {
    vi.mocked(getTrainingRecordsOverview).mockResolvedValue(
      structuredClone(historyOverviewStoryFixture),
    )
    vi.mocked(listTrainingRecords).mockResolvedValue(structuredClone(historyRecordsStoryFixture))

    renderHistoryPage()

    expect(
      await screen.findByText(historyRecordsStoryFixture.items[0].reviewSummary!),
    ).toBeInTheDocument()
    expect(getTrainingRecordsOverview).toHaveBeenCalledOnce()
    expect(listTrainingRecords).toHaveBeenCalledWith({
      kinds: undefined,
      targetRoleId: undefined,
      startedAtFrom: undefined,
      page: 1,
      pageSize: 3,
    })
  })

  it("submits type filters to the service and resets the server page", async () => {
    const user = userEvent.setup()
    vi.mocked(getTrainingRecordsOverview).mockResolvedValue(
      structuredClone(historyOverviewStoryFixture),
    )
    vi.mocked(listTrainingRecords)
      .mockResolvedValueOnce(structuredClone(historyRecordsStoryFixture))
      .mockResolvedValueOnce(structuredClone(emptyHistoryRecordsStoryFixture))

    renderHistoryPage()

    await screen.findByText(historyRecordsStoryFixture.items[0].reviewSummary!)
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("history.filters.kinds.mockInterview"),
      }),
    )

    await waitFor(() =>
      expect(listTrainingRecords).toHaveBeenLastCalledWith({
        kinds: ["mockInterview"],
        targetRoleId: undefined,
        startedAtFrom: undefined,
        page: 1,
        pageSize: 3,
      }),
    )
    expect(await screen.findByText(i18n.t("history.empty.noMatches.title"))).toBeInTheDocument()
  })

  it("submits target-role and time-range filters to the service", async () => {
    const user = userEvent.setup()
    vi.mocked(getTrainingRecordsOverview).mockResolvedValue(
      structuredClone(historyOverviewStoryFixture),
    )
    vi.mocked(listTrainingRecords).mockResolvedValue(structuredClone(historyRecordsStoryFixture))

    renderHistoryPage()

    await screen.findByText(historyRecordsStoryFixture.items[0].reviewSummary!)
    await user.click(screen.getByRole("combobox", { name: i18n.t("history.filters.roleLabel") }))
    await user.click(
      await screen.findByRole("option", {
        name: /金融科技产品经理/,
      }),
    )

    await waitFor(() =>
      expect(listTrainingRecords).toHaveBeenLastCalledWith(
        expect.objectContaining({
          targetRoleId: "role_product_manager_fintech",
          page: 1,
        }),
      ),
    )

    await user.click(screen.getByRole("combobox", { name: i18n.t("history.filters.periodLabel") }))
    await user.click(
      await screen.findByRole("option", {
        name: i18n.t("history.filters.periods.last7Days"),
      }),
    )

    await waitFor(() =>
      expect(listTrainingRecords).toHaveBeenLastCalledWith(
        expect.objectContaining({
          targetRoleId: "role_product_manager_fintech",
          startedAtFrom: expect.any(String),
          page: 1,
        }),
      ),
    )
  })

  it("requests the next server page from pagination controls", async () => {
    const user = userEvent.setup()
    const secondPage = {
      items: historyRecordsStoryFixture.items.slice(0, 2),
      pagination: {
        page: 2,
        pageSize: 3,
        totalItems: 5,
        totalPages: 2,
      },
    }
    vi.mocked(getTrainingRecordsOverview).mockResolvedValue(
      structuredClone(historyOverviewStoryFixture),
    )
    vi.mocked(listTrainingRecords)
      .mockResolvedValueOnce(structuredClone(historyRecordsStoryFixture))
      .mockResolvedValueOnce(structuredClone(secondPage))

    renderHistoryPage()

    await user.click(await screen.findByRole("button", { name: i18n.t("history.pagination.next") }))

    await waitFor(() =>
      expect(listTrainingRecords).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 3 }),
      ),
    )
    expect(
      await screen.findByText(i18n.t("history.pagination.page", { page: 2, total: 2 })),
    ).toBeInTheDocument()
  })

  it("distinguishes never-trained from filtered-empty using overview totals", async () => {
    vi.mocked(getTrainingRecordsOverview).mockResolvedValue(
      structuredClone(emptyHistoryOverviewStoryFixture),
    )
    vi.mocked(listTrainingRecords).mockResolvedValue(
      structuredClone(emptyHistoryRecordsStoryFixture),
    )

    renderHistoryPage()

    expect(await screen.findByText(i18n.t("history.empty.neverTrained.title"))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("history.empty.noMatches.title"))).not.toBeInTheDocument()
  })

  it("maps failures to error and retries both queries", async () => {
    const user = userEvent.setup()
    vi.mocked(getTrainingRecordsOverview)
      .mockRejectedValueOnce(new Error("overview failed"))
      .mockResolvedValueOnce(structuredClone(historyOverviewStoryFixture))
    vi.mocked(listTrainingRecords)
      .mockRejectedValueOnce(new Error("list failed"))
      .mockResolvedValueOnce(structuredClone(historyRecordsStoryFixture))

    renderHistoryPage()

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("history.error.title"))
    await user.click(screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }))

    expect(
      await screen.findByText(historyRecordsStoryFixture.items[0].reviewSummary!),
    ).toBeInTheDocument()
    expect(getTrainingRecordsOverview).toHaveBeenCalledTimes(2)
    expect(listTrainingRecords).toHaveBeenCalledTimes(2)
  })

  it("keeps the newest result when filters change faster than requests finish", async () => {
    const user = userEvent.setup()
    const interviewRequest = createDeferred<typeof historyRecordsStoryFixture>()
    const practiceRequest = createDeferred<typeof historyRecordsStoryFixture>()
    const interviewResult = structuredClone(historyRecordsStoryFixture)
    const practiceResult = structuredClone(historyRecordsStoryFixture)
    interviewResult.items[0].reviewSummary = "stale interview response"
    practiceResult.items[0].reviewSummary = "latest practice response"
    vi.mocked(getTrainingRecordsOverview).mockResolvedValue(
      structuredClone(historyOverviewStoryFixture),
    )
    vi.mocked(listTrainingRecords).mockImplementation((input) => {
      if (input.kinds?.[0] === "mockInterview") return interviewRequest.promise
      if (input.kinds?.[0] === "targetedPractice") return practiceRequest.promise
      return Promise.resolve(structuredClone(historyRecordsStoryFixture))
    })

    renderHistoryPage()
    await screen.findByText(historyRecordsStoryFixture.items[0].reviewSummary!)
    await user.click(
      screen.getByRole("button", { name: i18n.t("history.filters.kinds.mockInterview") }),
    )
    await user.click(
      screen.getByRole("button", { name: i18n.t("history.filters.kinds.targetedPractice") }),
    )

    practiceRequest.resolve(practiceResult)
    expect(await screen.findByText("latest practice response")).toBeInTheDocument()
    interviewRequest.resolve(interviewResult)
    await waitFor(() =>
      expect(screen.queryByText("stale interview response")).not.toBeInTheDocument(),
    )
    expect(screen.getByText("latest practice response")).toBeInTheDocument()
  })
})
