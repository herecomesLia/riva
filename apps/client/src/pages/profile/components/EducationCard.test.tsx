import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { EducationEntryResponse } from "@/api/generated/models"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { EducationCard } from "@/pages/profile/components/EducationCard"
import { formatMonth } from "@/pages/profile/components/profile-formatters"
import { renderWithProviders } from "@/test/render"

function createEducation(overrides: Partial<EducationEntryResponse> = {}): EducationEntryResponse {
  return { ...structuredClone(careerProfileFixture.education[0]!), ...overrides }
}

function renderCard(education: EducationEntryResponse[], onEdit = vi.fn()) {
  return {
    onEdit,
    ...renderWithProviders(<EducationCard education={education} onEdit={onEdit} />, {
      router: false,
    }),
  }
}

function carouselNames() {
  const section = i18n.t("profile.sections.education")
  return {
    next: i18n.t("profile.carousel.next", { section }),
    previous: i18n.t("profile.carousel.previous", { section }),
  }
}

describe("EducationCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders the contract fields and a completed date range", () => {
    renderCard([createEducation()])

    expect(screen.getByText("Zhejiang University")).toBeInTheDocument()
    expect(screen.getByText("Bachelor of Engineering · Computer Science")).toBeInTheDocument()
    expect(
      screen.getByText(
        i18n.t("profile.field.dateRange", {
          end: formatMonth("2020-06", i18n.language, "—"),
          start: formatMonth("2016-09", i18n.language, "—"),
        }),
      ),
    ).toBeInTheDocument()
  })

  it("switches records and keeps the active index valid", async () => {
    const user = userEvent.setup()
    const first = createEducation()
    const second = createEducation({ school: "Tongji University" })
    const onEdit = vi.fn()
    const { rerender } = renderCard([first, second], onEdit)

    await user.click(screen.getByRole("button", { name: carouselNames().next }))
    expect(screen.getByText("Tongji University")).toBeInTheDocument()

    rerender(<EducationCard education={[first]} onEdit={onEdit} />)
    expect(await screen.findByText("Zhejiang University")).toBeInTheDocument()
    expect(screen.queryByText("Tongji University")).not.toBeInTheDocument()
  })

  it("derives the present label from a null end date", () => {
    renderCard([createEducation({ endDate: null })])
    expect(screen.getByText(new RegExp(i18n.t("profile.field.present")))).toBeInTheDocument()
  })

  it("renders the empty state and edit action", async () => {
    const user = userEvent.setup()
    const empty = renderCard([])
    expect(screen.getAllByText(i18n.t("profile.emptySection"))).toHaveLength(2)
    empty.unmount()

    const { onEdit } = renderCard([createEducation()])
    const card = screen.getByTestId("profile-section-education")
    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
