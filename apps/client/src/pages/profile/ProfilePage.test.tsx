import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import {
  careerProfileFixture,
  resumeImportedCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"
import { ProfilePage } from "@/pages/profile/ProfilePage"
import * as profileService from "@/services/profile"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/profile")>()),
  createCareerProfile: vi.fn(),
  getCareerProfile: vi.fn(),
  extractCareerProfileFromText: vi.fn(),
  updateCareerProfile: vi.fn(),
  getCareerProfileExtractionState: vi.fn(),
  retryCareerProfileExtraction: vi.fn(),
  abortCareerProfileExtraction: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function renderPage() {
  return renderWithProviders(<ProfilePage />, { router: { initialEntries: ["/profile"] } })
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.mocked(profileService.createCareerProfile).mockReset()
    vi.mocked(profileService.getCareerProfile).mockReset()
    vi.mocked(profileService.extractCareerProfileFromText).mockReset()
    vi.mocked(profileService.updateCareerProfile).mockReset()
    vi.mocked(profileService.getCareerProfileExtractionState)
      .mockReset()
      .mockResolvedValue({ status: "idle", error: null })
    vi.mocked(profileService.retryCareerProfileExtraction).mockReset()
    vi.mocked(profileService.abortCareerProfileExtraction).mockReset()
  })

  it("maps the initial request to loading and then ready", async () => {
    const request = deferred<typeof careerProfileFixture>()
    vi.mocked(profileService.getCareerProfile).mockReturnValue(request.promise)

    renderPage()
    expect(await screen.findByTestId("profile-loading-state")).toBeInTheDocument()

    await act(async () => request.resolve(structuredClone(careerProfileFixture)))
    expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
  })

  it("moves an initial error through retry to ready without exposing the raw error", async () => {
    const user = userEvent.setup()
    vi.mocked(profileService.getCareerProfile)
      .mockRejectedValueOnce(new Error("private failure"))
      .mockResolvedValue(structuredClone(careerProfileFixture))
    vi.mocked(profileService.getCareerProfileExtractionState).mockResolvedValue({
      status: "running",
      error: null,
    })

    renderPage()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )

    expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
    expect(screen.queryByText("private failure")).not.toBeInTheDocument()
  })

  it("refetches the profile when an accepted extraction has already finished", async () => {
    const user = userEvent.setup()
    vi.mocked(profileService.getCareerProfile).mockResolvedValue(null)
    vi.mocked(profileService.extractCareerProfileFromText).mockImplementation(async () => {
      vi.mocked(profileService.getCareerProfile).mockResolvedValue(
        structuredClone(resumeImportedCareerProfileFixture),
      )
    })

    const result = renderPage()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    expect(
      await screen.findByText(resumeImportedCareerProfileFixture.projects[0]!.name),
    ).toBeInTheDocument()
    expect(result.queryClient.getQueryData(["profile"])).toEqual(resumeImportedCareerProfileFixture)
  })

  it("polls a task already active on entry and refreshes profile and roles when it becomes idle", async () => {
    vi.mocked(profileService.getCareerProfile).mockResolvedValue(careerProfileFixture)
    vi.mocked(profileService.getCareerProfileExtractionState)
      .mockResolvedValueOnce({ status: "running", error: null })
      .mockImplementation(async () => {
        vi.mocked(profileService.getCareerProfile).mockResolvedValue(
          resumeImportedCareerProfileFixture,
        )
        return { status: "idle", error: null }
      })
    const result = renderPage()
    result.queryClient.setQueryData(["roles"], { roles: [] })
    expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("profile.actions.abortExtraction") }),
    ).toBeEnabled()
    await waitFor(
      () =>
        expect(result.queryClient.getQueryData(["profile"])).toEqual(
          resumeImportedCareerProfileFixture,
        ),
      { timeout: 2500 },
    )
    expect(result.queryClient.getQueryState(["roles"])?.isInvalidated).toBe(true)
    expect(profileService.getCareerProfileExtractionState).toHaveBeenCalledTimes(2)
  })

  it("refreshes roles after manual profile creation", async () => {
    vi.mocked(profileService.getCareerProfile).mockResolvedValue(null)
    vi.mocked(profileService.createCareerProfile).mockImplementation(async () => {
      vi.mocked(profileService.getCareerProfile).mockResolvedValue(careerProfileFixture)
      return careerProfileFixture
    })
    const result = renderPage()
    const button = await screen.findByRole("button", {
      name: i18n.t("profile.actions.manualEntry"),
    })
    result.queryClient.setQueryData(["roles"], { roles: [] })
    await userEvent.setup().click(button)
    expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
    expect(result.queryClient.getQueryState(["roles"])?.isInvalidated).toBe(true)
  })
})
