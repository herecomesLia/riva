import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CareerProfileResponse } from "@/api/generated/models"
import { i18n } from "@/i18n/i18n"
import {
  careerProfileFixture,
  resumeImportedCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"
import { ProfileView, type ProfileViewActions } from "@/pages/profile/ProfileView"
import { formatDate } from "@/pages/profile/components/profile-formatters"
import { renderWithProviders } from "@/test/render"

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }))

vi.mock("sonner", () => ({ toast: { success: toastSuccess } }))

function createActions(): ProfileViewActions {
  return {
    createProfile: vi.fn(async () => structuredClone(careerProfileFixture)),
    importResume: vi.fn(async () => structuredClone(resumeImportedCareerProfileFixture)),
    updateProfile: vi.fn(async () => structuredClone(careerProfileFixture)),
  }
}

function renderReady(
  profile: CareerProfileResponse | null = structuredClone(careerProfileFixture),
  actions = createActions(),
) {
  return {
    actions,
    ...renderWithProviders(
      <ProfileView
        actions={actions}
        content={{ status: "ready", data: profile }}
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
    const result = renderWithProviders(
      <ProfileView content={{ status: "loading" }} variant="default" />,
    )
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
    expect(actions.importResume).toHaveBeenCalledWith({ file: undefined, text: "resume text" })

    await user.click(screen.getByRole("button", { name: i18n.t("profile.actions.manualEntry") }))
    expect(actions.createProfile).toHaveBeenCalledOnce()
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

  it("imports an updated resume through the same raw-faker action", async () => {
    const user = userEvent.setup()
    const { actions } = renderReady()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    )
    await user.type(screen.getByLabelText(i18n.t("profile.import.text")), "updated resume")
    await user.click(screen.getByRole("button", { name: i18n.t("profile.import.submit") }))

    expect(actions.importResume).toHaveBeenCalledWith({ file: undefined, text: "updated resume" })
    expect(await screen.findByTestId("profile-import-success")).toBeInTheDocument()
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

    await waitFor(() => expect(actions.updateProfile).toHaveBeenCalledOnce())
    expect(actions.updateProfile).toHaveBeenCalledWith({
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
    actions.updateProfile = vi.fn(async () => {
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
