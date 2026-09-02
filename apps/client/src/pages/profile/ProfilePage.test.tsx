import { act, screen } from "@testing-library/react"
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
  createProfile: vi.fn(),
  getProfile: vi.fn(),
  importResume: vi.fn(),
  updateProfile: vi.fn(),
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
    vi.mocked(profileService.createProfile).mockReset()
    vi.mocked(profileService.getProfile).mockReset()
    vi.mocked(profileService.importResume).mockReset()
    vi.mocked(profileService.updateProfile).mockReset()
  })

  it("maps the initial request to loading and then ready", async () => {
    const request = deferred<typeof careerProfileFixture>()
    vi.mocked(profileService.getProfile).mockReturnValue(request.promise)

    renderPage()
    expect(await screen.findByTestId("profile-loading-state")).toBeInTheDocument()

    await act(async () => request.resolve(structuredClone(careerProfileFixture)))
    expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
  })

  it("moves an initial error through retry to ready without exposing the raw error", async () => {
    const user = userEvent.setup()
    vi.mocked(profileService.getProfile)
      .mockRejectedValueOnce(new Error("private failure"))
      .mockResolvedValueOnce(structuredClone(careerProfileFixture))

    renderPage()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )

    expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
    expect(screen.queryByText("private failure")).not.toBeInTheDocument()
  })

  it("stores a resume import result as the current profile", async () => {
    const user = userEvent.setup()
    vi.mocked(profileService.getProfile).mockResolvedValue(null)
    vi.mocked(profileService.importResume).mockResolvedValue(
      structuredClone(resumeImportedCareerProfileFixture),
    )

    const result = renderPage()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    expect(
      await screen.findByText(resumeImportedCareerProfileFixture.projects[0]!.name),
    ).toBeInTheDocument()
    expect(result.queryClient.getQueryData(["profile"])).toEqual(resumeImportedCareerProfileFixture)
  })
})
