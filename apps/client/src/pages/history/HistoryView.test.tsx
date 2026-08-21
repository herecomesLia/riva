import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { HistoryView } from "@/pages/history"
import {
  emptyHistoryOverviewStoryFixture,
  emptyHistoryRecordsStoryFixture,
  historyOverviewStoryFixture,
  historyRecordsStoryFixture,
} from "@/pages/history/stories/history-story-fixtures"
import { renderWithProviders } from "@/test/render"

const filters = {
  kind: "all",
  targetRoleId: "all",
  timeRange: "all",
} as const

function renderHistoryView(
  state: React.ComponentProps<typeof HistoryView>["state"],
  overrides: Partial<React.ComponentProps<typeof HistoryView>> = {},
) {
  return renderWithProviders(
    <HistoryView
      filters={filters}
      onClearFilters={vi.fn()}
      onFiltersChange={vi.fn()}
      onPageChange={vi.fn()}
      onRetry={vi.fn()}
      state={state}
      {...overrides}
    />,
    { router: { initialEntries: ["/history"] } },
  )
}

describe("HistoryView", () => {
  it("keeps the page, filters, and records headings visible while dynamic content loads", async () => {
    renderHistoryView({ status: "loading" })

    expect(
      await screen.findByRole("heading", { level: 1, name: i18n.t("history.title") }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: i18n.t("history.overview.title") }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("history.overview.description"))).not.toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: i18n.t("history.overview.title") }),
    ).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.filters.title"))).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 2, name: i18n.t("history.records.title") }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("history-records-loading")).toBeInTheDocument()
  })

  it("renders ready business data and exposes a future detail entry", async () => {
    const record = historyRecordsStoryFixture.items[0]
    renderHistoryView({
      status: "ready",
      data: {
        overview: historyOverviewStoryFixture,
        records: historyRecordsStoryFixture,
      },
    })

    expect(await screen.findByText(record.reviewSummary!)).toBeInTheDocument()
    expect(
      screen.getAllByText(`${record.targetRole.title} · ${record.targetRole.company}`),
    ).not.toHaveLength(0)
    expect(screen.getByText("78/100")).toBeInTheDocument()
    const detailLink = screen.getByRole("button", {
      name: i18n.t("history.records.viewDetailsLabel", {
        date: new Intl.DateTimeFormat(i18n.language, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(record.startedAt)),
        kind: i18n.t(`history.filters.kinds.${record.kind}`),
        role: record.targetRole.title,
      }),
    })
    expect(detailLink.getAttribute("href")).toContain(`/history/practice/${record.id}`)
    expect(detailLink.getAttribute("href")).toContain("page=1")
  })

  it("moves focus after loading without scrolling past the page heading", async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    const props = {
      filters,
      onClearFilters: vi.fn(),
      onFiltersChange: vi.fn(),
      onPageChange: vi.fn(),
      onRetry: vi.fn(),
    }
    const { rerender } = renderWithProviders(
      <HistoryView {...props} state={{ status: "loading" }} />,
      { router: false },
    )

    rerender(<HistoryView {...props} state={{ status: "error", isRetrying: false }} />)

    await vi.waitFor(() => {
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    })
    expect(screen.getByTestId("history-state-region")).toHaveFocus()
    focusSpy.mockRestore()
  })

  it("links mock interview summaries to the independent history detail route", async () => {
    const record = historyRecordsStoryFixture.items.find((item) => item.kind === "mockInterview")
    if (!record) throw new Error("Mock interview history fixture is missing.")
    renderHistoryView({
      status: "ready",
      data: {
        overview: historyOverviewStoryFixture,
        records: historyRecordsStoryFixture,
      },
    })

    const detailButton = await screen.findByRole("button", {
      name: i18n.t("history.records.viewDetailsLabel", {
        date: new Intl.DateTimeFormat(i18n.language, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(record.startedAt)),
        kind: i18n.t("history.filters.kinds.mockInterview"),
        role: record.targetRole.title,
      }),
    })
    expect(detailButton.getAttribute("href")).toContain(`/history/interview/${record.id}`)
    expect(detailButton.getAttribute("href")).toContain("page=1")
  })

  it("forwards filter and pagination choices without owning query behavior", async () => {
    const user = userEvent.setup()
    const onFiltersChange = vi.fn()
    const onPageChange = vi.fn()
    renderHistoryView(
      {
        status: "ready",
        data: {
          overview: historyOverviewStoryFixture,
          records: historyRecordsStoryFixture,
        },
      },
      { onFiltersChange, onPageChange },
    )

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("history.filters.kinds.targetedPractice"),
      }),
    )
    await user.click(screen.getByRole("button", { name: i18n.t("history.pagination.next") }))

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      kind: "targetedPractice",
    })
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it.each([
    ["neverTrained", "history.empty.neverTrained.title"],
    ["noMatches", "history.empty.noMatches.title"],
  ] as const)("renders the %s empty reason explicitly", async (reason, titleKey) => {
    renderHistoryView({
      status: "empty",
      reason,
      data: {
        overview:
          reason === "neverTrained"
            ? emptyHistoryOverviewStoryFixture
            : historyOverviewStoryFixture,
        records: emptyHistoryRecordsStoryFixture,
      },
    })

    expect(await screen.findByText(i18n.t(titleKey))).toBeInTheDocument()
  })

  it("renders a contained error and forwards retry", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderHistoryView({ status: "error", isRetrying: false }, { onRetry })

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("history.error.title"))
    await user.click(screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("disables duplicate retry while a request is in flight", async () => {
    renderHistoryView({ status: "error", isRetrying: true })

    expect(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    ).toBeDisabled()
  })
})
