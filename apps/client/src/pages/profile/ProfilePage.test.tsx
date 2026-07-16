import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { profileResponseMock } from "@/mocks/data/profile"
import { ProfilePage } from "@/pages/profile"
import * as profileService from "@/services/profile"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/profile")>()),
  createManualJobProfile: vi.fn(),
  getJobProfile: vi.fn(),
  resetInitialResumeImport: vi.fn(),
  saveProfileSection: vi.fn(),
  startInitialResumeRecognition: vi.fn(),
  startUpdatedResumeRecognition: vi.fn(),
  uploadInitialResume: vi.fn(),
  uploadUpdatedResume: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function renderPage() {
  return renderWithProviders(<ProfilePage />, { router: { initialEntries: ["/profile"] } })
}

describe("ProfilePage orchestration", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.clearAllMocks()
  })

  it("maps the initial request to loading", async () => {
    vi.mocked(profileService.getJobProfile).mockReturnValue(new Promise(() => undefined))
    renderPage()
    expect(await screen.findByTestId("profile-loading-state")).toBeInTheDocument()
  })

  it("maps a successful request to ready", async () => {
    vi.mocked(profileService.getJobProfile).mockResolvedValue(structuredClone(profileResponseMock))
    renderPage()
    expect(
      await screen.findByText(profileResponseMock.profile!.projectExperiences[0]!.name),
    ).toBeInTheDocument()
  })

  it("moves error through retry loading to ready", async () => {
    const user = userEvent.setup()
    const retry = deferred<typeof profileResponseMock>()
    vi.mocked(profileService.getJobProfile)
      .mockRejectedValueOnce(new Error("private failure"))
      .mockReturnValueOnce(retry.promise)

    renderPage()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(screen.getByTestId("profile-loading-state")).toBeInTheDocument()
    expect(screen.queryByText("private failure")).not.toBeInTheDocument()

    await act(async () => retry.resolve(structuredClone(profileResponseMock)))
    expect(
      await screen.findByText(profileResponseMock.profile!.projectExperiences[0]!.name),
    ).toBeInTheDocument()
  })

  it("returns to error when retry fails again", async () => {
    const user = userEvent.setup()
    vi.mocked(profileService.getJobProfile)
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
    renderPage()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("common.pageState.error.title"),
    )
  })

  it("keeps ready data visible during a background refresh", async () => {
    const refresh = deferred<typeof profileResponseMock>()
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(structuredClone(profileResponseMock))
      .mockReturnValueOnce(refresh.promise)
    const result = renderPage()
    expect(
      await screen.findByText(profileResponseMock.profile!.projectExperiences[0]!.name),
    ).toBeInTheDocument()

    await act(async () => void result.queryClient.refetchQueries({ queryKey: ["profile"] }))
    await waitFor(() => expect(profileService.getJobProfile).toHaveBeenCalledTimes(2))
    expect(
      screen.getByText(profileResponseMock.profile!.projectExperiences[0]!.name),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("profile-loading-state")).not.toBeInTheDocument()
    await act(async () => refresh.resolve(structuredClone(profileResponseMock)))
  })

  it("uploads and recognizes an initial resume before caching ready data", async () => {
    const user = userEvent.setup()
    const empty = { profile: null, recognition: null, resumeUpdate: null, matchingAnalysis: null }
    const uploading = structuredClone(profileResponseMock)
    uploading.profile!.resume!.id = "uploaded-resume"
    const recognized = structuredClone(profileResponseMock)
    recognized.profile!.status = "active"
    vi.mocked(profileService.getJobProfile).mockResolvedValue(empty)
    vi.mocked(profileService.uploadInitialResume).mockResolvedValue(uploading)
    vi.mocked(profileService.startInitialResumeRecognition).mockResolvedValue(recognized)

    renderPage()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    await waitFor(() =>
      expect(profileService.startInitialResumeRecognition).toHaveBeenCalledWith(
        uploading.profile!.profileId,
        "uploaded-resume",
      ),
    )
    expect(await screen.findByTestId("profile-import-success")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-review-notice")).not.toBeInTheDocument()
  })

  it("keeps the upload form and shows safe feedback when upload fails", async () => {
    const user = userEvent.setup()
    vi.mocked(profileService.getJobProfile).mockResolvedValue({
      profile: null,
      recognition: null,
      resumeUpdate: null,
      matchingAnalysis: null,
    })
    vi.mocked(profileService.uploadInitialResume).mockRejectedValue(new Error("raw upload error"))
    renderPage()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))
    expect(await screen.findByText(i18n.t("profile.import.failed"))).toBeInTheDocument()
    expect(screen.queryByText("raw upload error")).not.toBeInTheDocument()
  })

  it("updates the query cache with the saved section returned by the mutation", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    const saved = structuredClone(snapshot.profile!)
    saved.education[0]!.school = "Updated University"
    vi.mocked(profileService.getJobProfile).mockResolvedValue(snapshot)
    vi.mocked(profileService.saveProfileSection).mockResolvedValue(saved)

    renderPage()
    const educationCard = await screen.findByTestId("profile-section-education")
    await user.click(withinCardButton(educationCard, i18n.t("profile.actions.edit")))
    const school = screen.getAllByLabelText(i18n.t("profile.formField.school"))[0]!
    await user.clear(school)
    await user.type(school, "Updated University")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await screen.findByText("Updated University")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-save-success")).not.toBeInTheDocument()
  })

  it("retains the draft after a save failure", async () => {
    const user = userEvent.setup()
    vi.mocked(profileService.getJobProfile).mockResolvedValue(structuredClone(profileResponseMock))
    vi.mocked(profileService.saveProfileSection).mockRejectedValue(new Error("raw save error"))
    renderPage()
    const educationCard = await screen.findByTestId("profile-section-education")
    await user.click(withinCardButton(educationCard, i18n.t("profile.actions.edit")))
    const school = screen.getAllByLabelText(i18n.t("profile.formField.school"))[0]!
    await user.clear(school)
    await user.type(school, "Unsaved University")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))
    expect(await screen.findByText(i18n.t("profile.editor.saveError"))).toBeInTheDocument()
    expect(school).toHaveValue("Unsaved University")
  })

  it("removes an experience after the section mutation succeeds", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    const removedTitle = snapshot.profile!.workExperiences[0].title
    const saved = structuredClone(snapshot.profile!)
    saved.workExperiences = saved.workExperiences.slice(1)
    vi.mocked(profileService.getJobProfile).mockResolvedValue(snapshot)
    vi.mocked(profileService.saveProfileSection).mockResolvedValue(saved)

    renderPage()
    const section = await screen.findByTestId("profile-section-workExperience")
    await user.click(withinCardButton(section, i18n.t("profile.actions.edit")))
    await user.click(screen.getAllByRole("button", { name: i18n.t("profile.editor.delete") })[0])
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(profileService.saveProfileSection).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.queryByTestId("profile-editor-workExperience")).not.toBeInTheDocument(),
    )
    expect(
      withinSection("profile-section-workExperience").queryByText(removedTitle),
    ).not.toBeInTheDocument()
  })

  it("keeps a deleted experience in the draft when the mutation fails", async () => {
    const user = userEvent.setup()
    vi.mocked(profileService.getJobProfile).mockResolvedValue(structuredClone(profileResponseMock))
    vi.mocked(profileService.saveProfileSection).mockRejectedValue(new Error("delete failed"))

    renderPage()
    const section = await screen.findByTestId("profile-section-workExperience")
    await user.click(withinCardButton(section, i18n.t("profile.actions.edit")))
    await user.click(screen.getAllByRole("button", { name: i18n.t("profile.editor.delete") })[0])
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await screen.findByText(i18n.t("profile.editor.saveError"))).toBeInTheDocument()
    expect(screen.getByTestId("profile-editor-workExperience")).toBeInTheDocument()
    expect(screen.queryByText("delete failed")).not.toBeInTheDocument()
  })
})

function withinCardButton(card: HTMLElement, name: string) {
  return Array.from(card.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(name),
  )!
}

function withinSection(testId: string) {
  return within(screen.getByTestId(testId))
}
