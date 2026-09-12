import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { renderWithProviders } from "@/test/render"
import {
  archiveRole,
  createRole,
  deleteRole,
  getRoles,
  match,
  extractJd,
  retryJdExtraction,
  abortJdExtraction,
  getJdExtractionState,
  getMatchingAnalysis,
  recognizeRole,
  restoreRole,
  setActiveRole,
  updateJd,
  updateRole,
} from "@/services/roles"

import { RolesPage } from "./RolesPage"
import { createRoleStoryResponse } from "./stories/role-story-fixtures"

vi.mock("@/services/roles", () => ({
  archiveRole: vi.fn(),
  createRole: vi.fn(),
  deleteRole: vi.fn(),
  getRoles: vi.fn(),
  match: vi.fn(),
  extractJd: vi.fn(),
  retryJdExtraction: vi.fn(),
  abortJdExtraction: vi.fn(),
  getJdExtractionState: vi.fn(),
  getMatchingAnalysis: vi.fn(),
  recognizeRole: vi.fn(),
  restoreRole: vi.fn(),
  setActiveRole: vi.fn(),
  updateJd: vi.fn(),
  updateRole: vi.fn(),
}))

describe("RolesPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    for (const mock of [
      archiveRole,
      createRole,
      deleteRole,
      getRoles,
      match,
      extractJd,
      retryJdExtraction,
      abortJdExtraction,
      getJdExtractionState,
      getMatchingAnalysis,
      recognizeRole,
      restoreRole,
      setActiveRole,
      updateJd,
      updateRole,
    ]) {
      vi.mocked(mock).mockReset()
    }
    vi.mocked(getJdExtractionState).mockResolvedValue({ status: "idle", error: null })
    vi.mocked(getMatchingAnalysis).mockResolvedValue({ status: "none" })
  })

  it("loads TargetRoleListResponse and keeps selection separate from the active role", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("multipleRoles")
    vi.mocked(getRoles).mockResolvedValue(data)
    vi.mocked(setActiveRole).mockResolvedValue()

    renderPage()

    const otherRole = data.targetRoles.find((role) => role.id !== data.activeTargetRoleId)!
    await user.click(await screen.findByRole("button", { name: new RegExp(`^${otherRole.title}`) }))
    expect(setActiveRole).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.setCurrent") }))
    await waitFor(() => expect(setActiveRole).toHaveBeenCalledWith(otherRole.id))
  })

  it("shows the load error state and retries", async () => {
    const user = userEvent.setup()
    vi.mocked(getRoles)
      .mockRejectedValueOnce(new Error("network details"))
      .mockResolvedValueOnce(createRoleStoryResponse("noRoles"))

    renderPage()
    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.retry") }))
    expect(await screen.findByTestId("roles-empty-state")).toBeInTheDocument()
  })

  it("polls an active JD extraction and replaces the role with the ready formal result", async () => {
    const user = userEvent.setup()
    const extracting = createRoleStoryResponse("roleWithJobDescriptionExtracting")
    const ready = createRoleStoryResponse("roleWithExtractedJobDescription").targetRoles[0]!
    vi.mocked(getRoles)
      .mockResolvedValueOnce(extracting)
      .mockResolvedValue({ ...extracting, targetRoles: [ready] })
    vi.mocked(getJdExtractionState)
      .mockResolvedValueOnce({ status: "running", error: null })
      .mockResolvedValue({ status: "idle", error: null })

    renderPage()
    await waitFor(() =>
      expect(getJdExtractionState).toHaveBeenCalledWith(
        extracting.targetRoles[0]!.id,
        expect.any(AbortSignal),
      ),
    )
    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    expect(
      await screen.findByTestId("job-description-analysis", undefined, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it("polls a generating match and shows the fixed result", async () => {
    const user = userEvent.setup()
    const generating = createRoleStoryResponse("matchingAnalysisGenerating")
    const completed = createRoleStoryResponse("matchingAnalysisCurrent")
    const current = completed.matchingByRoleId[completed.targetRoles[0]!.id]!
    vi.mocked(getRoles).mockResolvedValue(generating)
    vi.mocked(getMatchingAnalysis)
      .mockResolvedValueOnce({ status: "generating" })
      .mockResolvedValue(current)

    renderPage()
    await waitFor(() =>
      expect(getMatchingAnalysis).toHaveBeenCalledWith(generating.targetRoles[0]!.id),
    )
    await user.click(
      await screen.findByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }),
    )
    expect(await screen.findByTestId("matching-analysis-result")).toBeInTheDocument()
  })

  it("keeps the extracting state recoverable when synchronization fails", async () => {
    const user = userEvent.setup()
    const extracting = createRoleStoryResponse("roleWithJobDescriptionExtracting")
    const ready = createRoleStoryResponse("roleWithExtractedJobDescription").targetRoles[0]!
    vi.mocked(getRoles)
      .mockResolvedValueOnce(extracting)
      .mockRejectedValueOnce(new Error("network details"))
      .mockResolvedValue({ ...extracting, targetRoles: [ready] })
    vi.mocked(getJdExtractionState).mockResolvedValue({ status: "idle", error: null })

    renderPage()
    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    const card = await screen.findByTestId("job-description-card")
    await user.click(
      await within(card).findByRole("button", { name: i18n.t("roles.jd.actions.resynchronize") }),
    )
    expect(await screen.findByTestId("job-description-analysis")).toBeInTheDocument()
    expect(screen.queryByText("network details")).not.toBeInTheDocument()
  })
})

function renderPage() {
  return renderWithProviders(<RolesPage />, { router: { initialEntries: ["/roles"] } })
}
