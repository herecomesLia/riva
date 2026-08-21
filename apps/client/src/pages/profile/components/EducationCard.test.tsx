import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"
import { EducationCard } from "@/pages/profile/components/EducationCard"
import { renderWithProviders } from "@/test/render"

type Education = JobProfile["education"][number]

function createEducation(overrides: Partial<Education> = {}): Education {
  return {
    ...structuredClone(profileResponseMock.profile!.education[0]!),
    ...overrides,
  }
}

function renderCard(education: JobProfile["education"], onEdit = vi.fn()) {
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

  it("renders the local empty state", () => {
    renderCard([])

    expect(screen.getAllByText(i18n.t("profile.emptySection"))).toHaveLength(2)
  })

  it("hides navigation for one record", () => {
    renderCard([createEducation()])
    const names = carouselNames()

    expect(screen.queryByRole("button", { name: names.previous })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: names.next })).not.toBeInTheDocument()
  })

  it("switches between multiple records without rendering them together", async () => {
    const user = userEvent.setup()
    renderCard([
      createEducation(),
      createEducation({ id: "education_tongji", school: "Tongji University" }),
    ])
    const names = carouselNames()

    expect(screen.getByText("Fudan University")).toBeInTheDocument()
    expect(screen.queryByText("Tongji University")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: names.previous })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: names.next }))
    expect(screen.getByText("Tongji University")).toBeInTheDocument()
    expect(screen.queryByText("Fudan University")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: names.previous })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: names.next })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: names.previous }))
    expect(screen.getByText("Fudan University")).toBeInTheDocument()
  })

  it("keeps the active index valid when records are removed", async () => {
    const user = userEvent.setup()
    const first = createEducation()
    const second = createEducation({ id: "education_tongji", school: "Tongji University" })
    const onEdit = vi.fn()
    const { rerender } = renderCard([first, second], onEdit)

    await user.click(screen.getByRole("button", { name: carouselNames().next }))
    expect(screen.getByText("Tongji University")).toBeInTheDocument()

    rerender(<EducationCard education={[first]} onEdit={onEdit} />)
    expect(await screen.findByText("Fudan University")).toBeInTheDocument()
    expect(screen.queryByText("Tongji University")).not.toBeInTheDocument()
  })

  it("calls onEdit from the card action", async () => {
    const user = userEvent.setup()
    const { onEdit } = renderCard([createEducation()])
    const card = screen.getByTestId("profile-section-education")

    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
