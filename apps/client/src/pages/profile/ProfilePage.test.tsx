import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createProfileMockSnapshot, profileResponseMock } from "@/mocks/data/profile"
import { ProfilePage } from "@/pages/profile"
import * as profileService from "@/services/profile"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/profile")>()),
  createManualJobProfile: vi.fn(),
  getJobProfile: vi.fn(),
  getResumeRecognitionStatus: vi.fn(),
  getResumeUpdateStatus: vi.fn(),
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

  it("updates the cache from uploading through parsing to an active initial profile", async () => {
    const user = userEvent.setup()
    const empty = createProfileMockSnapshot("noProfile")
    const uploading = createProfileMockSnapshot("initialResumeUploading")
    const parsing = createProfileMockSnapshot("initialResumeRecognizing")
    const recognized = createProfileMockSnapshot("initialResumeRecognitionSucceeded")
    const recognition = deferred<NonNullable<typeof recognized.recognition>>()
    const startRecognition = deferred<typeof parsing>()
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(recognized)
    vi.mocked(profileService.uploadInitialResume).mockResolvedValue(uploading)
    vi.mocked(profileService.startInitialResumeRecognition).mockReturnValue(
      startRecognition.promise,
    )
    vi.mocked(profileService.getResumeRecognitionStatus).mockReturnValue(recognition.promise)

    const result = renderPage()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    await waitFor(() =>
      expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
        profile: { status: "uploadingResume" },
      }),
    )
    expect(await screen.findByTestId("profile-processing-state")).toBeInTheDocument()

    await act(async () => startRecognition.resolve(parsing))
    await waitFor(() =>
      expect(profileService.startInitialResumeRecognition).toHaveBeenCalledWith(
        uploading.profile!.profileId,
        "resume_initial_uploaded",
      ),
    )
    await waitFor(() =>
      expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
        profile: { status: "parsingResume" },
      }),
    )
    await act(async () => recognition.resolve(recognized.recognition!))

    expect(await screen.findByTestId("profile-import-success")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-review-notice")).not.toBeInTheDocument()
  })

  it("renders a recognition failure returned by the final snapshot", async () => {
    const user = userEvent.setup()
    const empty = createProfileMockSnapshot("noProfile")
    const uploading = createProfileMockSnapshot("initialResumeUploading")
    const parsing = createProfileMockSnapshot("initialResumeRecognizing")
    const failed = createProfileMockSnapshot("initialResumeRecognitionFailed")
    const startRecognition = deferred<typeof parsing>()
    const recognition = deferred<NonNullable<typeof failed.recognition>>()
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(failed)
    vi.mocked(profileService.uploadInitialResume).mockResolvedValue(uploading)
    vi.mocked(profileService.startInitialResumeRecognition).mockReturnValue(
      startRecognition.promise,
    )
    vi.mocked(profileService.getResumeRecognitionStatus).mockReturnValue(recognition.promise)

    const result = renderPage()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    await waitFor(() =>
      expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
        profile: { status: "uploadingResume" },
      }),
    )
    await act(async () => startRecognition.resolve(parsing))
    await waitFor(() =>
      expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
        profile: { status: "parsingResume" },
      }),
    )
    await act(async () => recognition.resolve(failed.recognition!))

    expect(await screen.findByTestId("profile-recognition-failure")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-synchronization-error")).not.toBeInTheDocument()
  })

  it("shows a safe recovery action when initial recognition synchronization fails", async () => {
    const user = userEvent.setup()
    const empty = createProfileMockSnapshot("noProfile")
    const uploading = createProfileMockSnapshot("initialResumeUploading")
    const parsing = createProfileMockSnapshot("initialResumeRecognizing")
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(empty)
      .mockRejectedValueOnce(new Error("synchronization failed"))
      .mockRejectedValueOnce(new Error("synchronization failed again"))
    vi.mocked(profileService.uploadInitialResume).mockResolvedValue(uploading)
    vi.mocked(profileService.startInitialResumeRecognition).mockResolvedValue(parsing)
    vi.mocked(profileService.getResumeRecognitionStatus).mockRejectedValue(
      new Error("recognition status request failed"),
    )

    const result = renderPage()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    await waitFor(() =>
      expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
        profile: { status: "parsingResume" },
      }),
    )
    expect(await screen.findByTestId("profile-processing-state")).toBeInTheDocument()
    expect(await screen.findByTestId("profile-synchronization-error")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("profile.lifecycle.syncFailed.retry") }),
    ).toBeEnabled()
    expect(screen.queryByText("recognition status request failed")).not.toBeInTheDocument()
  })

  it("recovers an initial recognition synchronization failure after retry", async () => {
    const user = userEvent.setup()
    const empty = createProfileMockSnapshot("noProfile")
    const uploading = createProfileMockSnapshot("initialResumeUploading")
    const parsing = createProfileMockSnapshot("initialResumeRecognizing")
    const recognized = createProfileMockSnapshot("initialResumeRecognitionSucceeded")
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(empty)
      .mockRejectedValueOnce(new Error("first refresh failed"))
      .mockRejectedValueOnce(new Error("second refresh failed"))
      .mockResolvedValueOnce(recognized)
    vi.mocked(profileService.uploadInitialResume).mockResolvedValue(uploading)
    vi.mocked(profileService.startInitialResumeRecognition).mockResolvedValue(parsing)
    vi.mocked(profileService.getResumeRecognitionStatus)
      .mockRejectedValueOnce(new Error("status failed"))
      .mockResolvedValueOnce(recognized.recognition!)

    const result = renderPage()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))
    const retry = await screen.findByRole("button", {
      name: i18n.t("profile.lifecycle.syncFailed.retry"),
    })

    await user.click(retry)
    await waitFor(() =>
      expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
        profile: { status: "active" },
      }),
    )
    expect(await screen.findByTestId("profile-import-success")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-synchronization-error")).not.toBeInTheDocument()
  })

  it("keeps the synchronization recovery action available when retry fails again", async () => {
    const user = userEvent.setup()
    const empty = createProfileMockSnapshot("noProfile")
    const uploading = createProfileMockSnapshot("initialResumeUploading")
    const parsing = createProfileMockSnapshot("initialResumeRecognizing")
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(empty)
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockRejectedValueOnce(new Error("refresh failed again"))
      .mockRejectedValueOnce(new Error("retry refresh failed"))
      .mockRejectedValueOnce(new Error("retry refresh failed again"))
    vi.mocked(profileService.uploadInitialResume).mockResolvedValue(uploading)
    vi.mocked(profileService.startInitialResumeRecognition).mockResolvedValue(parsing)
    vi.mocked(profileService.getResumeRecognitionStatus).mockRejectedValue(
      new Error("status failed"),
    )

    renderPage()
    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))
    const retry = await screen.findByRole("button", {
      name: i18n.t("profile.lifecycle.syncFailed.retry"),
    })

    await user.click(retry)
    expect(await screen.findByTestId("profile-synchronization-error")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("profile.lifecycle.syncFailed.retry") }),
    ).toBeEnabled()
  })

  it("keeps the active profile when resume update synchronization fails", async () => {
    const user = userEvent.setup()
    const initial = createProfileMockSnapshot()
    const uploading = createProfileMockSnapshot("resumeUpdateUploading")
    const parsing = createProfileMockSnapshot("resumeUpdateRecognizing")
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockRejectedValueOnce(new Error("refresh failed again"))
    vi.mocked(profileService.uploadUpdatedResume).mockResolvedValue(uploading)
    vi.mocked(profileService.startUpdatedResumeRecognition).mockResolvedValue(parsing)
    vi.mocked(profileService.getResumeUpdateStatus).mockRejectedValue(
      new Error("update status failed"),
    )

    const result = renderPage()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: i18n.t("profile.actions.updateResume"),
      }),
    )
    await user.type(screen.getByLabelText(i18n.t("profile.import.text")), "updated resume")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    expect(await screen.findByTestId("profile-synchronization-error")).toBeInTheDocument()
    expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
      profile: { status: "active" },
      resumeUpdate: { status: "parsing" },
    })
    expect(screen.queryByTestId("profile-recognition-failure")).not.toBeInTheDocument()
    expect(screen.queryByText("update status failed")).not.toBeInTheDocument()
  })

  it("retries a failed recognition through parsing to active", async () => {
    const user = userEvent.setup()
    const failed = createProfileMockSnapshot("initialResumeRecognitionFailed")
    const parsing = createProfileMockSnapshot("initialResumeRecognizing")
    const recognized = createProfileMockSnapshot("initialResumeRecognitionSucceeded")
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(recognized)
    vi.mocked(profileService.startInitialResumeRecognition).mockResolvedValue(parsing)
    vi.mocked(profileService.getResumeRecognitionStatus).mockResolvedValue(recognized.recognition!)

    const result = renderPage()
    const failure = await screen.findByTestId("profile-recognition-failure")
    await user.click(
      within(failure).getByRole("button", { name: i18n.t("profile.actions.retryRecognition") }),
    )

    await waitFor(() =>
      expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
        profile: { status: "active" },
      }),
    )
    expect(await screen.findByTestId("profile-import-success")).toBeInTheDocument()
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

  it("updates the cache and feedback after an updated resume succeeds", async () => {
    const user = userEvent.setup()
    const initial = createProfileMockSnapshot()
    const uploading = createProfileMockSnapshot("resumeUpdateUploading")
    const parsing = createProfileMockSnapshot("resumeUpdateRecognizing")
    const succeeded = createProfileMockSnapshot("resumeUpdateSucceeded")
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(succeeded)
    vi.mocked(profileService.uploadUpdatedResume).mockResolvedValue(uploading)
    vi.mocked(profileService.startUpdatedResumeRecognition).mockResolvedValue(parsing)
    vi.mocked(profileService.getResumeUpdateStatus).mockResolvedValue(succeeded.resumeUpdate!)

    const result = renderPage()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: i18n.t("profile.actions.updateResume"),
      }),
    )
    await user.type(screen.getByLabelText(i18n.t("profile.import.text")), "updated resume")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    expect(await screen.findByTestId("profile-resume-update-success")).toBeInTheDocument()
    expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
      resumeUpdate: { status: "succeeded" },
    })
  })

  it("updates the cache without exposing raw errors when an updated resume fails", async () => {
    const user = userEvent.setup()
    const initial = createProfileMockSnapshot()
    const uploading = createProfileMockSnapshot("resumeUpdateUploading")
    const parsing = createProfileMockSnapshot("resumeUpdateRecognizing")
    const failed = createProfileMockSnapshot("resumeUpdateFailed")
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(failed)
    vi.mocked(profileService.uploadUpdatedResume).mockResolvedValue(uploading)
    vi.mocked(profileService.startUpdatedResumeRecognition).mockResolvedValue(parsing)
    vi.mocked(profileService.getResumeUpdateStatus).mockResolvedValue(failed.resumeUpdate!)

    const result = renderPage()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: i18n.t("profile.actions.updateResume"),
      }),
    )
    await user.type(screen.getByLabelText(i18n.t("profile.import.text")), "updated resume")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    await waitFor(() =>
      expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
        resumeUpdate: { status: "failed" },
      }),
    )
    expect(screen.queryByText("raw update error")).not.toBeInTheDocument()
  })

  it("updates the query cache with the saved section returned by the mutation", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    const saved = structuredClone(snapshot.profile!)
    saved.education[0]!.school = "Updated University"
    saved.matchingAnalysisStale = true
    saved.version += 1
    const savedSnapshot = {
      ...snapshot,
      matchingAnalysis: { ...snapshot.matchingAnalysis!, status: "stale" as const },
      profile: saved,
    }
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(savedSnapshot)
    vi.mocked(profileService.saveProfileSection).mockResolvedValue(savedSnapshot)

    const result = renderPage()
    const educationCard = await screen.findByTestId("profile-section-education")
    await user.click(withinCardButton(educationCard, i18n.t("profile.actions.edit")))
    const school = screen.getAllByLabelText(i18n.t("profile.formField.school"))[0]!
    await user.clear(school)
    await user.type(school, "Updated University")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await screen.findByText("Updated University")).toBeInTheDocument()
    expect(screen.queryByTestId("profile-save-success")).not.toBeInTheDocument()
    expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
      matchingAnalysis: { profileVersion: 7, status: "stale" },
      profile: { matchingAnalysisStale: true, version: 8 },
    })
  })

  it("keeps a successful save successful when its background refresh fails", async () => {
    const user = userEvent.setup()
    const snapshot = structuredClone(profileResponseMock)
    const saved = structuredClone(snapshot.profile!)
    saved.education[0]!.school = "Saved Despite Refresh Failure"
    saved.matchingAnalysisStale = true
    saved.version += 1
    const savedSnapshot = {
      ...snapshot,
      matchingAnalysis: { ...snapshot.matchingAnalysis!, status: "stale" as const },
      profile: saved,
    }
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockRejectedValueOnce(new Error("refresh failed again"))
    vi.mocked(profileService.saveProfileSection).mockResolvedValue(savedSnapshot)

    const result = renderPage()
    const educationCard = await screen.findByTestId("profile-section-education")
    await user.click(withinCardButton(educationCard, i18n.t("profile.actions.edit")))
    const school = screen.getAllByLabelText(i18n.t("profile.formField.school"))[0]!
    await user.clear(school)
    await user.type(school, "Saved Despite Refresh Failure")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await screen.findByText("Saved Despite Refresh Failure")).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("profile.editor.saveError"))).not.toBeInTheDocument()
    expect(result.queryClient.getQueryData(["profile"])).toMatchObject({
      matchingAnalysis: { profileVersion: 7, status: "stale" },
      profile: { matchingAnalysisStale: true, version: 8 },
    })
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
    saved.matchingAnalysisStale = true
    saved.version += 1
    const savedSnapshot = {
      ...snapshot,
      matchingAnalysis: { ...snapshot.matchingAnalysis!, status: "stale" as const },
      profile: saved,
    }
    vi.mocked(profileService.getJobProfile)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(savedSnapshot)
    vi.mocked(profileService.saveProfileSection).mockResolvedValue(savedSnapshot)

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
