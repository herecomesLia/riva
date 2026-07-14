import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfileSnapshot } from "@/models/profile"
import { ProfileView, type ProfileViewActions } from "@/pages/profile/ProfileView"
import { renderWithProviders } from "@/test/render"

function createActions(): ProfileViewActions {
  return {
    cancelRecognition: vi.fn(async () => structuredClone(profileResponseMock)),
    cancelResumeUpdate: vi.fn(async () => structuredClone(profileResponseMock)),
    confirmRecognition: vi.fn(async () => structuredClone(profileResponseMock.profile!)),
    confirmResumeUpdate: vi.fn(async () => structuredClone(profileResponseMock.profile!)),
    createManualProfile: vi.fn(async () => structuredClone(profileResponseMock)),
    regenerateMatchingAnalysis: vi.fn(async () =>
      structuredClone(profileResponseMock.matchingAnalysis!),
    ),
    retryRecognition: vi.fn(async () => structuredClone(profileResponseMock)),
    saveSection: vi.fn(async () => structuredClone(profileResponseMock.profile!)),
    uploadInitialResume: vi.fn(async () => structuredClone(profileResponseMock)),
    uploadUpdatedResume: vi.fn(async () => structuredClone(profileResponseMock)),
  }
}

function renderReady(
  snapshot: JobProfileSnapshot = structuredClone(profileResponseMock),
  actions = createActions(),
) {
  return {
    actions,
    ...renderWithProviders(
      <ProfileView
        actions={actions}
        content={{ status: "ready", data: snapshot }}
        pending={{ analysis: false, cancelUpdate: false, confirmUpdate: false }}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    ),
  }
}

describe("ProfileView", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders the full loading layout without a service", async () => {
    renderWithProviders(<ProfileView content={{ status: "loading" }} variant="default" />)
    expect(await screen.findByTestId("profile-loading-state")).toBeInTheDocument()
  })

  it("renders complete business data", async () => {
    renderReady()
    expect(await screen.findByText("Lin Chen")).toBeInTheDocument()
    expect(screen.getByText("Merchant Operations Console")).toBeInTheDocument()
    expect(screen.getByText("AWS Certified Cloud Practitioner")).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.completeness"))).toBeInTheDocument()
    expect(screen.getByText("100%")).toBeInTheDocument()
    expect(screen.getByText(i18n.t("profile.pendingReviewCount", { count: 0 }))).toBeInTheDocument()
    expect(screen.getAllByText(i18n.t("profile.reviewStatus.confirmed")).length).toBeGreaterThan(0)
    expect(screen.queryByTestId("profile-section-targetRoles")).not.toBeInTheDocument()
    expect(screen.queryByText("Frontend Technical Lead")).not.toBeInTheDocument()
  })

  it("renders a local no-resume state while preserving other sections", async () => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.resume = null
    renderReady(snapshot)
    expect(await screen.findByText(i18n.t("profile.resume.noResume"))).toBeInTheDocument()
    expect(screen.getByText("Lin Chen")).toBeInTheDocument()
  })

  it.each([
    ["education", "education"],
    ["workExperience", "workExperiences"],
    ["projectExperience", "projectExperiences"],
    ["skills", "skills"],
  ] as const)("renders a local empty state for %s", async (section, property) => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile![property] = []
    renderReady(snapshot)
    const card = await screen.findByTestId("profile-section-" + section)
    expect(within(card).getAllByText(i18n.t("profile.emptySection")).length).toBeGreaterThan(0)
  })

  it("renders partial nullable data without failing the page", async () => {
    const snapshot = structuredClone(profileResponseMock)
    snapshot.profile!.basicInformation.phone = null
    snapshot.profile!.credentials = []
    snapshot.profile!.projectExperiences = []
    renderReady(snapshot)
    expect(
      await screen.findByRole("heading", { name: i18n.t("profile.title") }),
    ).toBeInTheDocument()
    expect(screen.queryByText("+86 138 0000 1234")).not.toBeInTheDocument()
  })

  it("renders long user content verbatim", async () => {
    const snapshot = structuredClone(profileResponseMock)
    const longText = "Long profile content ".repeat(30)
    snapshot.profile!.basicInformation.personalSummary = longText
    renderReady(snapshot)
    expect(await screen.findByText(/Long profile content Long profile content/)).toBeInTheDocument()
  })

  it("renders a safe page error and invokes retry", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithProviders(<ProfileView onRetry={onRetry} variant="error" />)
    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("opens a business section editor without changing server data", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    renderReady(snapshot)
    const section = await screen.findByTestId("profile-section-basicInformation")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    expect(screen.getByTestId("profile-editor-basicInformation")).toBeInTheDocument()
    expect(snapshot).toEqual(profileResponseMock)
  })

  it("adds and removes an experience only in the draft until save", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady()
    const section = await screen.findByTestId("profile-section-workExperience")
    await user.click(within(section).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.addExperience") }))
    const deletes = screen.getAllByRole("button", { name: i18n.t("profile.editor.delete") })
    await user.click(deletes.at(-1)!)
    expect(actions.saveSection).not.toHaveBeenCalled()
  })
})
