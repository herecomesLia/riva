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
  it("keeps every module heading visible while dynamic content loads", async () => {
    renderHistoryView({ status: "loading" })

    expect(
      await screen.findByRole("heading", { level: 1, name: i18n.t("history.title") }),
    ).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.overview.title"))).toBeInTheDocument()
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
    expect(
      screen.getByRole("button", {
        name: i18n.t("history.records.viewDetailsLabel", {
          date: new Intl.DateTimeFormat(i18n.language, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(record.startedAt)),
          kind: i18n.t(`history.filters.kinds.${record.kind}`),
          role: record.targetRole.title,
        }),
      }),
    ).toHaveAttribute("href", `/history/${record.kind}/${record.id}`)
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
    renderHistoryView({ status: "error" }, { onRetry })

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("history.error.title"))
    await user.click(screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
