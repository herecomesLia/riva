import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  CareerProfileResponse,
  TaskStatusResponse,
  TaskFailureResponse,
} from "@/api/generated/models"
import { i18n } from "@/i18n/i18n"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { ProfileView, type ProfileViewActions } from "@/pages/profile/ProfileView"
import { formatDate } from "@/pages/profile/components/profile-formatters"
import { renderWithProviders } from "@/test/render"

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }))

vi.mock("sonner", () => ({ toast: { success: toastSuccess } }))

function createActions(): ProfileViewActions {
  return {
    createCareerProfile: vi.fn(async () => structuredClone(careerProfileFixture)),
    extractCareerProfileFromText: vi.fn(async () => undefined),
    retryCareerProfileExtraction: vi.fn(async () => undefined),
    abortCareerProfileExtraction: vi.fn(async () => undefined),
    retryCareerProfileExtractionState: vi.fn(async () => undefined),
    updateCareerProfile: vi.fn(async () => structuredClone(careerProfileFixture)),
  }
}

function renderReady(
  profile: CareerProfileResponse | null = structuredClone(careerProfileFixture),
  actions = createActions(),
  extractionState: TaskStatusResponse | TaskFailureResponse = { status: "idle", error: null },
  extractionStateError = false,
) {
  return {
    actions,
    ...renderWithProviders(
      <ProfileView
        actions={actions}
        profile={profile}
        extractionState={extractionState}
        extractionStateError={extractionStateError}
        variant="default"
      />,
      { router: { initialEntries: ["/profile"] } },
    ),
  }
}

describe("ProfileView", () => {
  beforeEach(() => {
    toastSuccess.mockClear()
  })

  it("renders loading and retryable error states without a service", async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    const result = renderWithProviders(<ProfileView variant="loading" />)
    expect(await screen.findByTestId("profile-loading-state")).toBeInTheDocument()

    result.rerender(<ProfileView onRetry={onRetry} variant="error" />)
    await user.click(screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("offers resume import and manual creation when no profile exists", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady(null)

    await user.type(await screen.findByLabelText(i18n.t("profile.import.text")), "resume text")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))
    expect(actions.extractCareerProfileFromText).toHaveBeenCalledWith({ text: "resume text" })

    await user.click(screen.getByRole("button", { name: i18n.t("profile.actions.manualEntry") }))
    expect(actions.createCareerProfile).toHaveBeenCalledOnce()
  })

  it("renders the generated profile and derives completeness from its sections", async () => {
    renderReady()

    expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
    expect(
      screen.getByRole("progressbar", { name: i18n.t("profile.completeness") }),
    ).toHaveAttribute("aria-valuenow", "100")
    expect(
      screen.getByText(
        i18n.t("profile.updatedAt", {
          value: formatDate(careerProfileFixture.updatedAt, i18n.language),
        }),
      ),
    ).toBeInTheDocument()
  })

  it.each(["queued", "running", "aborting"] as const)(
    "keeps the existing profile visible and disables editing while %s",
    async (status) => {
      const { actions } = renderReady(careerProfileFixture, createActions(), {
        status,
        error: null,
      })
      expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
      for (const button of screen.getAllByRole("button", { name: i18n.t("profile.actions.edit") }))
        expect(button).toBeDisabled()
      const abort = screen.getByRole("button", { name: i18n.t("profile.actions.abortExtraction") })
      if (status === "aborting") expect(abort).toBeDisabled()
      else {
        await userEvent.setup().click(abort)
        expect(actions.abortCareerProfileExtraction).toHaveBeenCalledOnce()
      }
    },
  )

  it("retains the old profile after failure and allows retry", async () => {
    const { actions } = renderReady(careerProfileFixture, createActions(), {
      status: "failed",
      error: { code: "invalid_output", message: "Unable to complete the task." },
    })
    expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: i18n.t("profile.actions.retryRecognition") }))
    expect(actions.retryCareerProfileExtraction).toHaveBeenCalledOnce()
  })

  it("keeps the profile visible when task synchronization fails and offers resynchronization", async () => {
    const { actions } = renderReady(
      careerProfileFixture,
      createActions(),
      { status: "idle", error: null },
      true,
    )
    expect(await screen.findByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: i18n.t("profile.lifecycle.syncFailed.retry") }))
    expect(actions.retryCareerProfileExtractionState).toHaveBeenCalledOnce()
  })

  it("closes the text dialog after submission without claiming extraction succeeded", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    await user.type(screen.getByLabelText(i18n.t("profile.import.text")), "updated resume")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    expect(actions.extractCareerProfileFromText).toHaveBeenCalledWith({ text: "updated resume" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByText(careerProfileFixture.projects[0]!.name)).toBeInTheDocument()
  })

  it("removes deleted top-level skills from work experiences in the same update", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady()
    const card = await screen.findByTestId("profile-section-skills")

    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    await user.click(
      screen.getAllByRole("button", {
        name: i18n.t("profile.editor.delete"),
      })[0]!,
    )
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    await waitFor(() => expect(actions.updateCareerProfile).toHaveBeenCalledOnce())
    expect(actions.updateCareerProfile).toHaveBeenCalledWith({
      skills: careerProfileFixture.skills.slice(1),
      workExperiences: [
        {
          ...careerProfileFixture.workExperiences[0],
          skills: ["React"],
        },
      ],
    })
  })

  it("keeps a failed save draft open and hides the raw error", async () => {
    const user = userEvent.setup()
    const actions = createActions()
    actions.updateCareerProfile = vi.fn(async () => {
      throw new Error("private save failure")
    })
    renderReady(structuredClone(careerProfileFixture), actions)

    const card = await screen.findByTestId("profile-section-education")
    await user.click(within(card).getByRole("button", { name: i18n.t("profile.actions.edit") }))
    await user.click(screen.getByRole("button", { name: i18n.t("profile.editor.save") }))

    expect(await screen.findByText(i18n.t("profile.editor.saveError"))).toBeInTheDocument()
    expect(screen.getByTestId("profile-editor-education")).toBeInTheDocument()
    expect(screen.queryByText("private save failure")).not.toBeInTheDocument()
  })
})
