import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createProfileMockSnapshot } from "@/mocks/data/profile"
import { ProfilePage } from "@/pages/profile"
import { getJobProfile } from "@/services/profile"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/profile", () => ({
  getJobProfile: vi.fn(),
}))

function renderProfilePage() {
  return renderWithProviders(<ProfilePage />, { router: { initialEntries: ["/profile"] } })
}

describe("ProfilePage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getJobProfile).mockReset()
  })

  it("renders an empty state when no profile exists", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("notCreated"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-empty-state")).toHaveTextContent(
      i18n.t("profile.empty.title"),
    )
    expect(screen.queryByText("Lin Chen")).not.toBeInTheDocument()
  })

  it("renders the recognition-in-progress state without structured profile sections", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("parsing"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-processing-state")).toHaveTextContent(
      i18n.t("profile.lifecycle.parsing.title"),
    )
    expect(
      screen.queryByRole("heading", { name: i18n.t("profile.sections.workExperience") }),
    ).not.toBeInTheDocument()
  })

  it("renders the recognition failure returned by the service", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("recognitionFailed"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-recognition-failure")).toHaveTextContent(
      "The document could not be parsed.",
    )
  })

  it("renders the main structured profile content in the complete state", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("complete"))

    renderProfilePage()

    expect(
      await screen.findByRole("heading", { name: i18n.t("profile.title") }),
    ).toBeInTheDocument()
    expect(screen.getByText("lin-chen-resume.pdf")).toBeInTheDocument()
    expect(screen.getByText("Lin Chen")).toBeInTheDocument()
    expect(screen.getAllByText("Senior Frontend Engineer").length).toBeGreaterThan(0)
    expect(screen.getByText("Merchant Operations Console")).toBeInTheDocument()
    expect(screen.getByText("AWS Certified Cloud Practitioner")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("profile.actions.viewTargetRoles") }),
    ).toHaveAttribute("href", "/roles")
  })

  it("shows a lightweight confirmation notice for recognized information that needs review", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("awaitingConfirmation"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-review-notice")).toHaveTextContent(
      i18n.t("profile.lifecycle.awaitingConfirmation.title"),
    )
    expect(screen.getAllByText(i18n.t("profile.reviewStatus.needsReview")).length).toBeGreaterThan(
      0,
    )
  })

  it("warns when matching analysis is stale", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("matchingAnalysisStale"))

    renderProfilePage()

    expect(await screen.findByTestId("profile-matching-analysis-stale")).toHaveTextContent(
      i18n.t("profile.matchingAnalysis.staleTitle"),
    )
  })

  it("keeps rendering when optional sections and basic fields are missing", async () => {
    vi.mocked(getJobProfile).mockResolvedValue(createProfileMockSnapshot("incomplete"))

    renderProfilePage()

    expect(
      await screen.findByRole("heading", { name: i18n.t("profile.sections.education") }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(i18n.t("profile.emptySection")).length).toBeGreaterThan(0)
    expect(screen.queryByText("+86 138 0000 1234")).not.toBeInTheDocument()
  })

  it("renders a retryable page error without exposing the raw service error", async () => {
    vi.mocked(getJobProfile).mockRejectedValue(new Error("raw profile service failure"))

    renderProfilePage()

    const alert = await screen.findByRole("alert")

    expect(alert).toHaveTextContent(i18n.t("common.pageState.error.title"))
    expect(alert).not.toHaveTextContent("raw profile service failure")
  })
})
