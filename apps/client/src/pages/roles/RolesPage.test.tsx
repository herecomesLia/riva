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
  listRoles,
  startRoleMatching,
  abortRoleMatching,
  extractJdFromText,
  retryJdExtraction,
  abortJdExtraction,
  getJdExtractionState,
  getRoleMatchingState,
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
  listRoles: vi.fn(),
  startRoleMatching: vi.fn(),
  abortRoleMatching: vi.fn(),
  extractJdFromText: vi.fn(),
  retryJdExtraction: vi.fn(),
  abortJdExtraction: vi.fn(),
  getJdExtractionState: vi.fn(),
  getRoleMatchingState: vi.fn(),
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
      listRoles,
      startRoleMatching,
      abortRoleMatching,
      extractJdFromText,
      retryJdExtraction,
      abortJdExtraction,
      getJdExtractionState,
      getRoleMatchingState,
      recognizeRole,
      restoreRole,
      setActiveRole,
      updateJd,
      updateRole,
    ]) {
      vi.mocked(mock).mockReset()
    }
    vi.mocked(getJdExtractionState).mockResolvedValue({ status: "idle", error: null })
    vi.mocked(getRoleMatchingState).mockResolvedValue({ status: "idle", error: null })
  })

  it("loads RoleListResponse and keeps selection separate from the active role", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("multipleRoles")
    vi.mocked(listRoles).mockResolvedValue(data)
    vi.mocked(setActiveRole).mockResolvedValue()

    renderPage()

    const otherRole = data.roles.find((role) => role.id !== data.activeRoleId)!
    await user.click(await screen.findByRole("button", { name: new RegExp(`^${otherRole.title}`) }))
    expect(setActiveRole).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.setCurrent") }))
    await waitFor(() => expect(setActiveRole).toHaveBeenCalledWith(otherRole.id))
  })

  it("queries matching only for the selected role", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("multipleRoles")
    vi.mocked(listRoles).mockResolvedValue(data)
    renderPage()
    await waitFor(() =>
      expect(getRoleMatchingState).toHaveBeenCalledWith(data.activeRoleId, expect.any(AbortSignal)),
    )
    const other = data.roles.find((role) => role.id !== data.activeRoleId)!
    expect(getRoleMatchingState).not.toHaveBeenCalledWith(other.id, expect.any(AbortSignal))
    await user.click(screen.getByRole("button", { name: new RegExp(`^${other.title}`) }))
    await waitFor(() =>
      expect(getRoleMatchingState).toHaveBeenCalledWith(other.id, expect.any(AbortSignal)),
    )
  })

  it("starts and cancels regeneration while preserving the old report", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("matchingAnalysisStale")
    vi.mocked(listRoles).mockResolvedValue(data)
    vi.mocked(startRoleMatching).mockImplementation(async () => {
      vi.mocked(getRoleMatchingState).mockResolvedValue({ status: "running", error: null })
    })
    vi.mocked(abortRoleMatching).mockImplementation(async () => {
      vi.mocked(getRoleMatchingState)
        .mockResolvedValueOnce({ status: "aborting", error: null })
        .mockResolvedValue({ status: "idle", error: null })
    })
    renderPage()
    await user.click(
      await screen.findByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }),
    )
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.matching.actions.regenerate") }),
    )
    await waitFor(() => expect(startRoleMatching).toHaveBeenCalledWith(data.roles[0]!.id))
    expect(screen.getByTestId("matching-analysis-result")).toBeInTheDocument()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.matching.actions.abort") }),
    )
    await waitFor(() => expect(abortRoleMatching).toHaveBeenCalledWith(data.roles[0]!.id))
    expect(screen.getByTestId("matching-analysis-result")).toBeInTheDocument()
    expect(
      await screen.findByRole(
        "button",
        { name: i18n.t("roles.matching.actions.regenerate") },
        { timeout: 3000 },
      ),
    ).toBeEnabled()
  })

  it("recovers a failed state request without discarding the saved report", async () => {
    const user = userEvent.setup()
    vi.mocked(listRoles).mockResolvedValue(createRoleStoryResponse("matchingAnalysisCurrent"))
    vi.mocked(getRoleMatchingState)
      .mockRejectedValueOnce(new Error("private details"))
      .mockResolvedValue({ status: "idle", error: null })
    renderPage()
    await user.click(
      await screen.findByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }),
    )
    expect(await screen.findByTestId("matching-analysis-result")).toBeInTheDocument()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.matching.actions.resynchronize") }),
    )
    expect(
      await screen.findByRole("button", { name: i18n.t("roles.matching.actions.regenerate") }),
    ).toBeEnabled()
    expect(screen.queryByText("private details")).not.toBeInTheDocument()
  })

  it("shows the load error state and retries", async () => {
    const user = userEvent.setup()
    vi.mocked(listRoles)
      .mockRejectedValueOnce(new Error("network details"))
      .mockResolvedValueOnce(createRoleStoryResponse("noRoles"))

    renderPage()
    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.retry") }))
    expect(await screen.findByTestId("roles-empty-state")).toBeInTheDocument()
  })

  it("polls an active JD extraction and replaces the role with the ready formal result", async () => {
    const user = userEvent.setup()
    const extracting = createRoleStoryResponse("roleWithJobDescriptionExtracting")
    const ready = createRoleStoryResponse("roleWithExtractedJobDescription").roles[0]!
    vi.mocked(listRoles)
      .mockResolvedValueOnce(extracting)
      .mockResolvedValue({ ...extracting, roles: [ready] })
    vi.mocked(getJdExtractionState)
      .mockResolvedValueOnce({ status: "running", error: null })
      .mockResolvedValue({ status: "idle", error: null })

    renderPage()
    await waitFor(() =>
      expect(getJdExtractionState).toHaveBeenCalledWith(
        extracting.roles[0]!.id,
        expect.any(AbortSignal),
      ),
    )
    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    expect(
      await screen.findByTestId("job-description-analysis", undefined, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it("polls a generating startRoleMatching and shows the fixed result", async () => {
    const user = userEvent.setup()
    const generating = createRoleStoryResponse("matchingAnalysisGenerating")
    const completed = createRoleStoryResponse("matchingAnalysisCurrent")
    const current = completed.matchingStatesByRoleId[completed.roles[0]!.id]!
    vi.mocked(listRoles).mockResolvedValueOnce(generating).mockResolvedValue(completed)
    vi.mocked(getRoleMatchingState)
      .mockResolvedValueOnce({ status: "running", error: null })
      .mockResolvedValue(current)

    renderPage()
    await waitFor(() =>
      expect(getRoleMatchingState).toHaveBeenCalledWith(
        generating.roles[0]!.id,
        expect.any(AbortSignal),
      ),
    )
    await user.click(
      await screen.findByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }),
    )
    expect(
      await screen.findByTestId("matching-analysis-result", undefined, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it("keeps the extracting state recoverable when synchronization fails", async () => {
    const user = userEvent.setup()
    const extracting = createRoleStoryResponse("roleWithJobDescriptionExtracting")
    const ready = createRoleStoryResponse("roleWithExtractedJobDescription").roles[0]!
    vi.mocked(listRoles)
      .mockResolvedValueOnce(extracting)
      .mockRejectedValueOnce(new Error("network details"))
      .mockResolvedValue({ ...extracting, roles: [ready] })
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
