import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createRolesMockResponse } from "@/mocks/data/roles"
import { RolesPage } from "@/pages/roles"
import { JOB_DESCRIPTION_POLL_INTERVAL_MS } from "@/pages/roles/hooks/useJobDescriptionSynchronization"
import { MATCHING_ANALYSIS_POLL_INTERVAL_MS } from "@/pages/roles/hooks/useMatchingAnalysisSynchronization"
import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  generateMatchingAnalysis,
  getJobDescriptionParsingStatus,
  getMatchingAnalysisStatus,
  getRolesPage,
  saveJobDescription,
  setCurrentTargetRole,
  startJobDescriptionParsing,
  updateRolePreparationStatus,
  updateJobDescriptionAnalysisModule,
  updateTargetRole,
} from "@/services/roles"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/roles")>()),
  getRolesPage: vi.fn(),
  archiveTargetRole: vi.fn(),
  createTargetRole: vi.fn(),
  deleteTargetRole: vi.fn(),
  generateMatchingAnalysis: vi.fn(),
  getJobDescriptionParsingStatus: vi.fn(),
  getMatchingAnalysisStatus: vi.fn(),
  saveJobDescription: vi.fn(),
  setCurrentTargetRole: vi.fn(),
  startJobDescriptionParsing: vi.fn(),
  updateRolePreparationStatus: vi.fn(),
  updateJobDescriptionAnalysisModule: vi.fn(),
  updateTargetRole: vi.fn(),
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function renderRolesPage() {
  return renderWithProviders(<RolesPage />, { router: { initialEntries: ["/roles"] } })
}

const mutationMocks = [
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  generateMatchingAnalysis,
  saveJobDescription,
  setCurrentTargetRole,
  startJobDescriptionParsing,
  updateRolePreparationStatus,
  updateJobDescriptionAnalysisModule,
  updateTargetRole,
] as const

describe("RolesPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getRolesPage).mockReset()
    vi.mocked(getJobDescriptionParsingStatus).mockReset()
    vi.mocked(getMatchingAnalysisStatus).mockReset()
    mutationMocks.forEach((mutation) => vi.mocked(mutation).mockReset())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("maps an initial request to the stable loading layout", async () => {
    vi.mocked(getRolesPage).mockReturnValue(new Promise(() => undefined))

    renderRolesPage()

    expect(await screen.findByRole("heading", { name: i18n.t("roles.title") })).toBeInTheDocument()
    expect(screen.getByTestId("roles-loading-state")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: i18n.t("roles.list.title") })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: i18n.t("roles.details.title") })).toBeInTheDocument()
  })

  it("maps a successful request to the ready view", async () => {
    const response = createRolesMockResponse("multipleRoles")
    vi.mocked(getRolesPage).mockResolvedValue(response)

    renderRolesPage()

    expect(
      await screen.findByRole("button", { name: new RegExp(`^${response.roles[0]!.title}`) }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: new RegExp(`^${response.roles[1]!.title}`) }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("roles-loading-state")).not.toBeInTheDocument()
  })

  it("maps an empty response to the no-roles state", async () => {
    vi.mocked(getRolesPage).mockResolvedValue(createRolesMockResponse("noRoles"))

    renderRolesPage()

    expect(await screen.findByTestId("roles-empty-state")).toBeInTheDocument()
  })

  it("shows the error state and refetches after retry", async () => {
    const user = userEvent.setup()
    const firstRequest = createDeferred<ReturnType<typeof createRolesMockResponse>>()
    const secondResponse = createRolesMockResponse("singleRoleWithoutJobDescription")
    vi.mocked(getRolesPage)
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(secondResponse)

    renderRolesPage()

    await act(async () => {
      firstRequest.reject(new Error("roles failure"))
    })
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(screen.queryByText("roles failure")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.retry") }))

    expect(
      await screen.findByRole("button", {
        name: new RegExp(`^${secondResponse.roles[0]!.title}`),
      }),
    ).toBeInTheDocument()
    expect(getRolesPage).toHaveBeenCalledTimes(2)
  })

  it("writes a create mutation response into the roles query cache", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("noRoles")
    const created = createRolesMockResponse("singleRoleWithoutJobDescription")
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(createTargetRole).mockResolvedValue(created)
    const { queryClient } = renderRolesPage()

    await screen.findByTestId("roles-empty-state")
    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.add") }))
    const dialog = await screen.findByRole("dialog")
    await user.type(
      within(dialog).getByLabelText(i18n.t("roles.editor.fields.title")),
      created.roles[0]!.title,
    )
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") }))

    expect(
      await screen.findByRole("button", { name: new RegExp(`^${created.roles[0]!.title}`) }),
    ).toBeInTheDocument()
    expect(queryClient.getQueryData(["roles"])).toEqual(created)
  })

  it("keeps exactly one current role after setting a different current role", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("multipleRoles")
    const next = structuredClone(initial)
    const nextCurrent = next.roles.find((role) => !role.isCurrent)!
    next.currentRoleId = nextCurrent.id
    next.roles.forEach((role) => {
      role.isCurrent = role.id === nextCurrent.id
    })
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(setCurrentTargetRole).mockResolvedValue(next)
    const { queryClient } = renderRolesPage()

    await user.click(
      await screen.findByRole("button", { name: new RegExp(`^${nextCurrent.title}`) }),
    )
    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.setCurrent") }))

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(next))
    const cached = queryClient.getQueryData<ReturnType<typeof createRolesMockResponse>>(["roles"])!
    expect(cached.roles.filter((role) => role.isCurrent)).toHaveLength(1)
    expect(cached.currentRoleId).toBe(nextCurrent.id)
  })

  it("uses the service fallback after deleting the current role", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("multipleRoles")
    const current = initial.roles.find((role) => role.isCurrent)!
    const fallback = initial.roles.find((role) => !role.isCurrent)!
    fallback.preparationStatus = "preparing"
    const response = structuredClone(initial)
    response.roles = response.roles.filter((role) => role.id !== current.id)
    response.currentRoleId = fallback.id
    response.roles[0]!.isCurrent = true
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(deleteTargetRole).mockResolvedValue(response)
    const { queryClient } = renderRolesPage()

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.delete") }))
    const confirmation = await screen.findByRole("alertdialog")
    await user.click(
      within(confirmation).getByRole("button", { name: i18n.t("roles.actions.delete") }),
    )

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(response))
    expect(screen.queryByRole("heading", { name: current.title })).not.toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: fallback.title })).toBeInTheDocument()
  })

  it("preserves cached data when a mutation fails", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("multipleRoles")
    const otherRole = initial.roles.find((role) => !role.isCurrent)!
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(setCurrentTargetRole).mockRejectedValue(new Error("unsafe internal failure"))
    const { queryClient } = renderRolesPage()

    await user.click(await screen.findByRole("button", { name: new RegExp(`^${otherRole.title}`) }))
    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.setCurrent") }))

    expect(await screen.findByText(i18n.t("roles.errors.requestFailed"))).toBeInTheDocument()
    expect(queryClient.getQueryData(["roles"])).toEqual(initial)
    expect(screen.queryByText("unsafe internal failure")).not.toBeInTheDocument()
  })

  it("automatically synchronizes a parsing JD returned by the initial page request", async () => {
    const { initial, ready } = createJobDescriptionPollingResponses()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getJobDescriptionParsingStatus).mockResolvedValue(ready.roles[0]!)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(ready))
    await openJobDescriptionTab()
    expect(await screen.findByTestId("job-description-analysis")).toBeInTheDocument()
  })

  it("continues polling with each latest parsing snapshot until ready", async () => {
    const { initial, parsingOne, parsingTwo, ready } = createJobDescriptionPollingResponses()
    const firstStatus = createDeferred<(typeof parsingOne.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getJobDescriptionParsingStatus)
      .mockReturnValueOnce(firstStatus.promise)
      .mockResolvedValueOnce(parsingTwo.roles[0]!)
      .mockResolvedValueOnce(ready.roles[0]!)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(1))
    await openJobDescriptionTab()
    vi.useFakeTimers()
    await act(async () => firstStatus.resolve(parsingOne.roles[0]!))
    expect(queryClient.getQueryData(["roles"])).toEqual(parsingOne)
    expect(getJobDescriptionParsingStatus).toHaveBeenNthCalledWith(1, pollingInput(initial))

    await act(async () => vi.advanceTimersByTimeAsync(JOB_DESCRIPTION_POLL_INTERVAL_MS))
    expect(getJobDescriptionParsingStatus).toHaveBeenNthCalledWith(2, pollingInput(parsingOne))
    expect(queryClient.getQueryData(["roles"])).toEqual(parsingTwo)

    await act(async () => vi.advanceTimersByTimeAsync(JOB_DESCRIPTION_POLL_INTERVAL_MS))
    expect(getJobDescriptionParsingStatus).toHaveBeenNthCalledWith(3, pollingInput(parsingTwo))
    expect(queryClient.getQueryData(["roles"])).toEqual(ready)
    expect(screen.queryByText(i18n.t("roles.jd.synchronization.title"))).not.toBeInTheDocument()
  })

  it("stops after consecutive parsing responses reach a business failure", async () => {
    const { failed, initial, parsingOne } = createJobDescriptionPollingResponses()
    const firstStatus = createDeferred<(typeof parsingOne.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getJobDescriptionParsingStatus)
      .mockReturnValueOnce(firstStatus.promise)
      .mockResolvedValueOnce(failed.roles[0]!)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(1))
    await openJobDescriptionTab()
    vi.useFakeTimers()
    await act(async () => firstStatus.resolve(parsingOne.roles[0]!))
    await act(async () => vi.advanceTimersByTimeAsync(JOB_DESCRIPTION_POLL_INTERVAL_MS))

    expect(queryClient.getQueryData(["roles"])).toEqual(failed)
    expect(
      screen.getByText(failed.roles[0]!.jobDescription.parsingFailureReason!),
    ).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("roles.jd.synchronization.title"))).not.toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(JOB_DESCRIPTION_POLL_INTERVAL_MS * 2))
    expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(2)
  })

  it("does not let an old successful response overwrite a replacement JD", async () => {
    const user = userEvent.setup()
    const { initial, parsing: parsingA, ready: readyA } = createJobDescriptionFlowResponses()
    const parsingB = createReplacementParsingResponse(parsingA)
    const readyB = createReadyResponseFromParsing(parsingB, "Replacement platform JD summary.")
    const statusA = createDeferred<(typeof readyA.roles)[number]>()
    const statusB = createDeferred<(typeof readyB.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(saveJobDescription).mockResolvedValue(parsingA)
    vi.mocked(getJobDescriptionParsingStatus)
      .mockReturnValueOnce(statusA.promise)
      .mockReturnValueOnce(statusB.promise)
    const { queryClient } = renderRolesPage()

    await submitJobDescription(user, "Lead React architecture and TypeScript delivery.")
    await waitFor(() => expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(1))
    act(() => queryClient.setQueryData(["roles"], parsingB))
    await waitFor(() => expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(2))

    await act(async () => statusA.resolve(readyA.roles[0]!))
    expect(queryClient.getQueryData(["roles"])).toEqual(parsingB)
    expect(screen.queryByTestId("job-description-analysis")).not.toBeInTheDocument()
    expect(
      queryClient.getQueryData<ReturnType<typeof createRolesMockResponse>>(["roles"])!.roles[0],
    ).toMatchObject({
      version: parsingB.roles[0]!.version,
      jobDescription: {
        rawText: parsingB.roles[0]!.jobDescription.rawText,
        version: parsingB.roles[0]!.jobDescription.version,
      },
    })

    await act(async () => statusB.resolve(readyB.roles[0]!))
    expect(queryClient.getQueryData(["roles"])).toEqual(readyB)
    expect(await screen.findByText("Replacement platform JD summary.")).toBeInTheDocument()
  })

  it("does not let an old failed request mark a replacement JD as unsynchronized", async () => {
    const { initial } = createJobDescriptionPollingResponses()
    const parsingB = createReplacementParsingResponse(initial)
    const statusA = createDeferred<(typeof initial.roles)[number]>()
    const statusB = createDeferred<(typeof initial.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getJobDescriptionParsingStatus)
      .mockReturnValueOnce(statusA.promise)
      .mockReturnValueOnce(statusB.promise)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(1))
    act(() => queryClient.setQueryData(["roles"], parsingB))
    await waitFor(() => expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(2))
    await act(async () => statusA.reject(new Error("old request transport details")))

    expect(queryClient.getQueryData(["roles"])).toEqual(parsingB)
    expect(screen.queryByText(i18n.t("roles.jd.synchronization.title"))).not.toBeInTheDocument()
    expect(screen.queryByText("old request transport details")).not.toBeInTheDocument()
  })

  it("manual synchronization retry restores the complete polling loop", async () => {
    const { initial, parsingOne, ready } = createJobDescriptionPollingResponses()
    const resumedStatus = createDeferred<(typeof parsingOne.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getJobDescriptionParsingStatus)
      .mockRejectedValueOnce(new Error("temporary transport failure"))
      .mockReturnValueOnce(resumedStatus.promise)
      .mockResolvedValueOnce(ready.roles[0]!)
    const { queryClient } = renderRolesPage()

    await openJobDescriptionTab()
    const retry = await screen.findByRole("button", {
      name: i18n.t("roles.jd.actions.resynchronize"),
    })
    vi.useFakeTimers()
    fireEvent.click(retry)
    await act(async () => Promise.resolve())
    expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(2)
    expect(screen.getByText(i18n.t("roles.jd.synchronization.title"))).toBeInTheDocument()

    await act(async () => resumedStatus.resolve(parsingOne.roles[0]!))
    expect(queryClient.getQueryData(["roles"])).toEqual(parsingOne)
    expect(screen.queryByText(i18n.t("roles.jd.synchronization.title"))).not.toBeInTheDocument()

    await act(async () => vi.advanceTimersByTimeAsync(JOB_DESCRIPTION_POLL_INTERVAL_MS))
    expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(3)
    expect(queryClient.getQueryData(["roles"])).toEqual(ready)
    expect(screen.queryByText(i18n.t("roles.jd.synchronization.title"))).not.toBeInTheDocument()
  })

  it("cleans a pending polling timer when the page unmounts", async () => {
    const { initial, parsingOne } = createJobDescriptionPollingResponses()
    const firstStatus = createDeferred<(typeof parsingOne.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getJobDescriptionParsingStatus).mockReturnValueOnce(firstStatus.promise)
    const { queryClient, unmount } = renderRolesPage()

    await waitFor(() => expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(1))
    vi.useFakeTimers()
    await act(async () => firstStatus.resolve(parsingOne.roles[0]!))
    expect(queryClient.getQueryData(["roles"])).toEqual(parsingOne)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    unmount()
    await act(async () => vi.advanceTimersByTimeAsync(JOB_DESCRIPTION_POLL_INTERVAL_MS * 2))

    expect(getJobDescriptionParsingStatus).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(["roles"])).toEqual(parsingOne)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("writes the parsing response to cache immediately after saving JD", async () => {
    const user = userEvent.setup()
    const { initial, parsing } = createJobDescriptionFlowResponses()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(saveJobDescription).mockResolvedValue(parsing)
    vi.mocked(getJobDescriptionParsingStatus).mockReturnValue(new Promise(() => undefined))
    const { queryClient } = renderRolesPage()

    await submitJobDescription(user, "Lead React architecture and TypeScript delivery.")

    await waitFor(() =>
      expect(
        queryClient.getQueryData<ReturnType<typeof createRolesMockResponse>>(["roles"])!.roles[0]!
          .jobDescription.status,
      ).toBe("parsing"),
    )
  })

  it("replaces the parsing cache entry with the successful parsing result", async () => {
    const user = userEvent.setup()
    const { initial, parsing, ready } = createJobDescriptionFlowResponses()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(saveJobDescription).mockResolvedValue(parsing)
    vi.mocked(getJobDescriptionParsingStatus).mockResolvedValue(ready.roles[0]!)
    const { queryClient } = renderRolesPage()

    await submitJobDescription(user, "Lead React architecture and TypeScript delivery.")

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(ready))
    await openJobDescriptionTab()
    expect(await screen.findByTestId("job-description-analysis")).toBeInTheDocument()
  })

  it("stores a business parsing failure as failed JD state", async () => {
    const user = userEvent.setup()
    const { failed, initial, parsing } = createJobDescriptionFlowResponses()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(saveJobDescription).mockResolvedValue(parsing)
    vi.mocked(getJobDescriptionParsingStatus).mockResolvedValue(failed.roles[0]!)
    const { queryClient } = renderRolesPage()

    await submitJobDescription(user, "Unparseable copied job description.")

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(failed))
    expect(
      await screen.findByText(failed.roles[0]!.jobDescription.parsingFailureReason!),
    ).toBeInTheDocument()
  })

  it("retries a failed JD parse and stores the ready result", async () => {
    const user = userEvent.setup()
    const { failed, parsing, ready } = createJobDescriptionRetryResponses()
    vi.mocked(getRolesPage).mockResolvedValue(failed)
    vi.mocked(startJobDescriptionParsing).mockResolvedValue(parsing)
    vi.mocked(getJobDescriptionParsingStatus).mockResolvedValue(ready.roles[0]!)
    const { queryClient } = renderRolesPage()

    await openJobDescriptionTab()
    await screen.findByTestId("job-description-card")
    await user.click(screen.getByRole("button", { name: i18n.t("roles.jd.actions.retry") }))

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(ready))
    expect(await screen.findByTestId("job-description-analysis")).toBeInTheDocument()
  })

  it("keeps the parsing snapshot and offers synchronization retry after polling fails", async () => {
    const user = userEvent.setup()
    const { initial, parsing } = createJobDescriptionFlowResponses()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(saveJobDescription).mockResolvedValue(parsing)
    vi.mocked(getJobDescriptionParsingStatus).mockRejectedValue(new Error("network details"))
    const { queryClient } = renderRolesPage()

    await submitJobDescription(user, "Lead React architecture and TypeScript delivery.")

    expect(await screen.findByText(i18n.t("roles.jd.synchronization.title"))).toBeInTheDocument()
    expect(queryClient.getQueryData(["roles"])).toEqual(parsing)
    expect(screen.queryByText("network details")).not.toBeInTheDocument()
  })

  it("recovers from a synchronization failure when synchronization is retried", async () => {
    const user = userEvent.setup()
    const { initial, parsing, ready } = createJobDescriptionFlowResponses()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(saveJobDescription).mockResolvedValue(parsing)
    vi.mocked(getJobDescriptionParsingStatus)
      .mockRejectedValueOnce(new Error("temporary transport failure"))
      .mockResolvedValueOnce(ready.roles[0]!)
    const { queryClient } = renderRolesPage()

    await submitJobDescription(user, "Lead React architecture and TypeScript delivery.")
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.jd.actions.resynchronize") }),
    )

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(ready))
    expect(screen.queryByText(i18n.t("roles.jd.synchronization.title"))).not.toBeInTheDocument()
    expect(await screen.findByTestId("job-description-analysis")).toBeInTheDocument()
  })

  it("uses the saved response that marks an existing analysis stale", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("matchingAnalysisCurrent")
    const parsing = createReplacementParsingResponse(initial)
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(saveJobDescription).mockResolvedValue(parsing)
    vi.mocked(getJobDescriptionParsingStatus).mockReturnValue(new Promise(() => undefined))
    const { queryClient } = renderRolesPage()

    await openJobDescriptionTab()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.jd.actions.replace") }),
    )
    const dialog = await screen.findByRole("dialog")
    const textarea = within(dialog).getByLabelText(i18n.t("roles.jd.editor.fieldLabel"))
    await user.clear(textarea)
    await user.type(textarea, "A replacement JD for a platform engineering position.")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(parsing))
    expect(
      await screen.findAllByText(i18n.t("roles.matchingAnalysisStatus.stale.label")),
    ).not.toHaveLength(0)
  })

  it.each([
    "profileMissing",
    "profileIncomplete",
    "singleRoleWithoutJobDescription",
    "roleWithJobDescriptionParsing",
    "roleWithJobDescriptionFailed",
  ] as const)("does not expose generation when %s blocks its prerequisites", async (scenario) => {
    vi.mocked(getRolesPage).mockResolvedValue(createRolesMockResponse(scenario))
    if (scenario === "roleWithJobDescriptionParsing") {
      vi.mocked(getJobDescriptionParsingStatus).mockReturnValue(new Promise(() => undefined))
    }

    renderRolesPage()

    await openMatchingAnalysisTab()
    const card = await screen.findByTestId("matching-analysis-card")
    expect(
      within(card).queryByRole("button", { name: i18n.t("roles.matching.actions.generate") }),
    ).not.toBeInTheDocument()
    expect(generateMatchingAnalysis).not.toHaveBeenCalled()
  })

  it("writes the generating mutation response into cache and starts status polling", async () => {
    const user = userEvent.setup()
    const { generating, initial } = createMatchingAnalysisFlowResponses()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(generateMatchingAnalysis).mockResolvedValue(generating)
    vi.mocked(getMatchingAnalysisStatus).mockReturnValue(new Promise(() => undefined))
    const { queryClient } = renderRolesPage()

    await openMatchingAnalysisTab()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.matching.actions.generate") }),
    )

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(generating))
    expect(vi.mocked(generateMatchingAnalysis).mock.calls[0]?.[0]).toEqual({
      roleId: initial.roles[0]!.id,
      version: initial.roles[0]!.version,
    })
    await waitFor(() =>
      expect(getMatchingAnalysisStatus).toHaveBeenCalledWith(matchingPollingInput(generating)),
    )
  })

  it("automatically polls an initial generating analysis into current", async () => {
    const initial = createRolesMockResponse("matchingAnalysisGenerating")
    const current = createCurrentMatchingAnalysisResponse(initial)
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getMatchingAnalysisStatus).mockResolvedValue(current.roles[0]!)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(current))
    await openMatchingAnalysisTab()
    expect(await screen.findByTestId("matching-analysis-result")).toBeInTheDocument()
  })

  it("continues matching polling with each latest generating snapshot", async () => {
    const initial = createRolesMockResponse("matchingAnalysisGenerating")
    const generatingTwo = createNextGeneratingAnalysisResponse(initial)
    const generatingThree = createNextGeneratingAnalysisResponse(generatingTwo)
    const current = createCurrentMatchingAnalysisResponse(generatingThree)
    const firstStatus = createDeferred<(typeof generatingTwo.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getMatchingAnalysisStatus)
      .mockReturnValueOnce(firstStatus.promise)
      .mockResolvedValueOnce(generatingThree.roles[0]!)
      .mockResolvedValueOnce(current.roles[0]!)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(1))
    vi.useFakeTimers()
    await act(async () => firstStatus.resolve(generatingTwo.roles[0]!))
    expect(queryClient.getQueryData(["roles"])).toEqual(generatingTwo)
    expect(getMatchingAnalysisStatus).toHaveBeenNthCalledWith(1, matchingPollingInput(initial))

    await act(async () => vi.advanceTimersByTimeAsync(MATCHING_ANALYSIS_POLL_INTERVAL_MS))
    expect(getMatchingAnalysisStatus).toHaveBeenNthCalledWith(
      2,
      matchingPollingInput(generatingTwo),
    )
    expect(queryClient.getQueryData(["roles"])).toEqual(generatingThree)

    await act(async () => vi.advanceTimersByTimeAsync(MATCHING_ANALYSIS_POLL_INTERVAL_MS))
    expect(getMatchingAnalysisStatus).toHaveBeenNthCalledWith(
      3,
      matchingPollingInput(generatingThree),
    )
    expect(queryClient.getQueryData(["roles"])).toEqual(current)
  })

  it("normalizes a completed result to stale when the profile advances during generation", async () => {
    const initial = createRolesMockResponse("matchingAnalysisGenerating")
    const role = initial.roles[0]!
    if (!initial.profileContext.exists || role.matchingAnalysis?.status !== "generating") {
      throw new Error("Expected an existing profile and generating analysis.")
    }
    initial.profileContext.version = 3
    role.matchingAnalysis.profileVersion = 3
    const current = createCurrentMatchingAnalysisResponse(initial)
    const status = createDeferred<(typeof current.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getMatchingAnalysisStatus).mockReturnValue(status.promise)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(1))
    const profileUpdated = structuredClone(initial)
    if (!profileUpdated.profileContext.exists) throw new Error("Expected an existing profile.")
    profileUpdated.profileContext.version = 4
    act(() => queryClient.setQueryData(["roles"], profileUpdated))
    await act(async () => status.resolve(current.roles[0]!))

    const cached = queryClient.getQueryData<ReturnType<typeof createRolesMockResponse>>(["roles"])!
    expect(cached.profileContext).toMatchObject({ exists: true, version: 4 })
    expect(cached.roles[0]!.matchingAnalysis).toMatchObject({
      status: "stale",
      profileVersion: 3,
      result: current.roles[0]!.matchingAnalysis!.result,
    })
    await openMatchingAnalysisTab()
    expect(await screen.findByText(i18n.t("roles.matching.stale.title"))).toBeInTheDocument()
    expect(screen.getByTestId("matching-analysis-result")).toBeInTheDocument()
  })

  it("does not let an old successful analysis response overwrite a new generation", async () => {
    const generationA = createRolesMockResponse("matchingAnalysisGenerating")
    const generationB = createGenerationForNextProfileVersion(generationA)
    const currentA = createCurrentMatchingAnalysisResponse(generationA)
    const statusA = createDeferred<(typeof currentA.roles)[number]>()
    const statusB = createDeferred<(typeof generationB.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(generationA)
    vi.mocked(getMatchingAnalysisStatus)
      .mockReturnValueOnce(statusA.promise)
      .mockReturnValueOnce(statusB.promise)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(1))
    act(() => queryClient.setQueryData(["roles"], generationB))
    await waitFor(() => expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(2))
    await act(async () => statusA.resolve(currentA.roles[0]!))

    expect(queryClient.getQueryData(["roles"])).toEqual(generationB)
    expect(screen.queryByTestId("matching-analysis-result")).not.toBeInTheDocument()
  })

  it("does not let an old failed analysis request pollute a new generation", async () => {
    const generationA = createRolesMockResponse("matchingAnalysisGenerating")
    const generationB = createGenerationForNextProfileVersion(generationA)
    const statusA = createDeferred<(typeof generationA.roles)[number]>()
    const statusB = createDeferred<(typeof generationB.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(generationA)
    vi.mocked(getMatchingAnalysisStatus)
      .mockReturnValueOnce(statusA.promise)
      .mockReturnValueOnce(statusB.promise)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(1))
    act(() => queryClient.setQueryData(["roles"], generationB))
    await waitFor(() => expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(2))
    await act(async () => statusA.reject(new Error("old analysis transport details")))

    expect(queryClient.getQueryData(["roles"])).toEqual(generationB)
    expect(
      screen.queryByText(i18n.t("roles.matching.synchronization.title")),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("old analysis transport details")).not.toBeInTheDocument()
  })

  it("does not let an old matching response overwrite a corrected structured JD module", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("matchingAnalysisGenerating")
    const oldCurrent = createCurrentMatchingAnalysisResponse(initial)
    const corrected = structuredClone(initial)
    const correctedRole = corrected.roles[0]!
    if (correctedRole.jobDescription.status !== "ready" || !correctedRole.jobDescriptionAnalysis) {
      throw new Error("Expected a ready structured JD analysis.")
    }
    corrected.roles[0] = {
      ...correctedRole,
      version: correctedRole.version + 1,
      jobDescriptionAnalysis: {
        ...correctedRole.jobDescriptionAnalysis,
        analysisVersion: correctedRole.jobDescriptionAnalysis.analysisVersion + 1,
        requiredSkills: ["React", "TypeScript", "Accessibility"],
      },
      matchingAnalysis: null,
    }
    const oldStatus = createDeferred<(typeof oldCurrent.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getMatchingAnalysisStatus).mockReturnValue(oldStatus.promise)
    vi.mocked(updateJobDescriptionAnalysisModule).mockResolvedValue(corrected)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(1))
    await openJobDescriptionTab()
    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", {
          module: i18n.t("roles.jd.analysis.requiredSkills"),
        }),
      }),
    )
    const dialog = await screen.findByRole("dialog")
    const textarea = within(dialog).getByLabelText(i18n.t("roles.jd.analysisEditor.fieldLabel"))
    await user.clear(textarea)
    await user.type(textarea, "React\nTypeScript\nAccessibility")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.actions.saveCorrection") }),
    )
    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(corrected))

    await act(async () => oldStatus.resolve(oldCurrent.roles[0]!))
    expect(queryClient.getQueryData(["roles"])).toEqual(corrected)
  })

  it("stores a matching-analysis business failure and stops polling", async () => {
    const initial = createRolesMockResponse("matchingAnalysisGenerating")
    const failed = createFailedMatchingAnalysisResponse(initial)
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getMatchingAnalysisStatus).mockResolvedValue(failed.roles[0]!)
    const { queryClient } = renderRolesPage()

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(failed))
    await openMatchingAnalysisTab()
    expect(
      await screen.findByText(failed.roles[0]!.matchingAnalysis!.failureReason!),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(i18n.t("roles.matching.synchronization.title")),
    ).not.toBeInTheDocument()
    expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(1)
  })

  it("restores the complete matching polling loop after synchronization retry", async () => {
    const initial = createRolesMockResponse("matchingAnalysisGenerating")
    const generatingTwo = createNextGeneratingAnalysisResponse(initial)
    const generatingThree = createNextGeneratingAnalysisResponse(generatingTwo)
    const current = createCurrentMatchingAnalysisResponse(generatingThree)
    const resumedStatus = createDeferred<(typeof generatingTwo.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getMatchingAnalysisStatus)
      .mockRejectedValueOnce(new Error("analysis transport details"))
      .mockReturnValueOnce(resumedStatus.promise)
      .mockResolvedValueOnce(generatingThree.roles[0]!)
      .mockResolvedValueOnce(current.roles[0]!)
    const { queryClient } = renderRolesPage()

    await openMatchingAnalysisTab()
    const retry = await screen.findByRole("button", {
      name: i18n.t("roles.matching.actions.resynchronize"),
    })
    vi.useFakeTimers()
    fireEvent.click(retry)
    await act(async () => Promise.resolve())
    expect(screen.getByText(i18n.t("roles.matching.synchronization.title"))).toBeInTheDocument()

    await act(async () => resumedStatus.resolve(generatingTwo.roles[0]!))
    expect(queryClient.getQueryData(["roles"])).toEqual(generatingTwo)
    expect(
      screen.queryByText(i18n.t("roles.matching.synchronization.title")),
    ).not.toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(MATCHING_ANALYSIS_POLL_INTERVAL_MS))
    expect(queryClient.getQueryData(["roles"])).toEqual(generatingThree)
    await act(async () => vi.advanceTimersByTimeAsync(MATCHING_ANALYSIS_POLL_INTERVAL_MS))
    expect(queryClient.getQueryData(["roles"])).toEqual(current)
    expect(getMatchingAnalysisStatus).toHaveBeenNthCalledWith(
      3,
      matchingPollingInput(generatingTwo),
    )
    expect(getMatchingAnalysisStatus).toHaveBeenNthCalledWith(
      4,
      matchingPollingInput(generatingThree),
    )
  })

  it("cleans a matching polling timer when the page unmounts", async () => {
    const initial = createRolesMockResponse("matchingAnalysisGenerating")
    const generatingTwo = createNextGeneratingAnalysisResponse(initial)
    const firstStatus = createDeferred<(typeof generatingTwo.roles)[number]>()
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(getMatchingAnalysisStatus).mockReturnValueOnce(firstStatus.promise)
    const { queryClient, unmount } = renderRolesPage()

    await waitFor(() => expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(1))
    vi.useFakeTimers()
    await act(async () => firstStatus.resolve(generatingTwo.roles[0]!))
    expect(queryClient.getQueryData(["roles"])).toEqual(generatingTwo)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    unmount()
    await act(async () => vi.advanceTimersByTimeAsync(MATCHING_ANALYSIS_POLL_INTERVAL_MS * 2))

    expect(getMatchingAnalysisStatus).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(["roles"])).toEqual(generatingTwo)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("regenerates stale analysis with current dependency versions", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("matchingAnalysisStale")
    if (!initial.profileContext.exists || initial.roles[0]!.jobDescription.status !== "ready") {
      throw new Error("Expected complete stale-analysis prerequisites.")
    }
    const generating = createGeneratingMatchingAnalysisResponse(initial)
    const current = createCurrentMatchingAnalysisResponse(generating)
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(generateMatchingAnalysis).mockResolvedValue(generating)
    vi.mocked(getMatchingAnalysisStatus).mockResolvedValue(current.roles[0]!)
    const { queryClient } = renderRolesPage()

    await openMatchingAnalysisTab()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.matching.actions.regenerate") }),
    )

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(current))
    expect(current.roles[0]!.matchingAnalysis).toMatchObject({
      status: "current",
      profileVersion: initial.profileContext.version,
      jobDescriptionVersion: initial.roles[0]!.jobDescription.version,
    })
  })

  it("preserves stale cache data and restores the button after generation request failure", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("matchingAnalysisStale")
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(generateMatchingAnalysis).mockRejectedValue(new Error("raw analysis service failure"))
    const { queryClient } = renderRolesPage()

    await openMatchingAnalysisTab()
    const regenerate = await screen.findByRole("button", {
      name: i18n.t("roles.matching.actions.regenerate"),
    })
    await user.click(regenerate)

    expect(await screen.findByText(i18n.t("roles.errors.requestFailed"))).toBeInTheDocument()
    expect(queryClient.getQueryData(["roles"])).toEqual(initial)
    expect(screen.getByTestId("matching-analysis-result")).toBeInTheDocument()
    expect(regenerate).toBeEnabled()
    expect(screen.queryByText("raw analysis service failure")).not.toBeInTheDocument()
  })

  it("merges a completed analysis without changing other roles or page context", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("multipleRoles")
    initial.roles[0]!.matchingAnalysis = null
    const untouchedRole = structuredClone(initial.roles[1]!)
    const generating = createGeneratingMatchingAnalysisResponse(initial)
    const current = createCurrentMatchingAnalysisResponse(generating)
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(generateMatchingAnalysis).mockResolvedValue(generating)
    vi.mocked(getMatchingAnalysisStatus).mockResolvedValue(current.roles[0]!)
    const { queryClient } = renderRolesPage()

    await openMatchingAnalysisTab()
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.matching.actions.generate") }),
    )

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(current))
    const cached = queryClient.getQueryData<ReturnType<typeof createRolesMockResponse>>(["roles"])!
    expect(cached.roles[1]).toEqual(untouchedRole)
    expect(cached.currentRoleId).toBe(initial.currentRoleId)
    expect(cached.profileContext).toEqual(initial.profileContext)
  })

  it("writes a structured JD module mutation response into the complete roles cache", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("matchingAnalysisCurrent")
    const next = structuredClone(initial)
    const role = next.roles[0]!
    if (role.jobDescription.status !== "ready" || !role.jobDescriptionAnalysis) {
      throw new Error("Expected a ready structured JD analysis.")
    }
    role.version += 1
    role.jobDescriptionAnalysis = {
      ...role.jobDescriptionAnalysis,
      analysisVersion: role.jobDescriptionAnalysis.analysisVersion + 1,
      coreRequirementsSummary: "Corrected summary for the role.",
    }
    role.matchingAnalysis = role.matchingAnalysis
      ? { ...role.matchingAnalysis, status: "stale" }
      : null
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(updateJobDescriptionAnalysisModule).mockResolvedValue(next)
    const { queryClient } = renderRolesPage()

    await openJobDescriptionTab()
    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", {
          module: i18n.t("roles.jd.analysis.summary"),
        }),
      }),
    )
    const dialog = await screen.findByRole("dialog")
    const field = within(dialog).getByLabelText(i18n.t("roles.jd.analysisEditor.fieldLabel"))
    await user.clear(field)
    await user.type(field, "Corrected summary for the role.")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.actions.saveCorrection") }),
    )

    expect(updateJobDescriptionAnalysisModule).toHaveBeenCalledWith(
      {
        roleId: initial.roles[0]!.id,
        version: initial.roles[0]!.version,
        jobDescriptionVersion: initial.roles[0]!.jobDescription.version,
        analysisVersion: initial.roles[0]!.jobDescriptionAnalysis?.analysisVersion,
        field: "coreRequirementsSummary",
        value: "Corrected summary for the role.",
      },
      expect.anything(),
    )
    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(next))
    expect(screen.getByText("Corrected summary for the role.")).toBeInTheDocument()
  })
})

async function submitJobDescription(user: ReturnType<typeof userEvent.setup>, rawText: string) {
  await openJobDescriptionTab()
  await screen.findByTestId("job-description-card")
  await user.click(screen.getByRole("button", { name: i18n.t("roles.jd.actions.add") }))
  const dialog = await screen.findByRole("dialog")
  await user.type(within(dialog).getByLabelText(i18n.t("roles.jd.editor.fieldLabel")), rawText)
  await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))
}

async function openJobDescriptionTab() {
  fireEvent.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
}

async function openMatchingAnalysisTab() {
  fireEvent.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }))
}

function createJobDescriptionFlowResponses() {
  const initial = createRolesMockResponse("singleRoleWithoutJobDescription")
  const parsing = createRolesMockResponse("roleWithJobDescriptionParsing")
  const parsingRole = parsing.roles[0]!
  if (parsingRole.jobDescription.status !== "parsing") {
    throw new Error("Expected the parsing JD fixture.")
  }
  parsingRole.version = initial.roles[0]!.version + 1
  parsingRole.jobDescription.rawText = "Lead React architecture and TypeScript delivery."

  const ready = createRolesMockResponse("roleWithParsedJobDescription")
  const readyRole = ready.roles[0]!
  if (readyRole.jobDescription.status !== "ready" || !readyRole.jobDescriptionAnalysis) {
    throw new Error("Expected the ready JD fixture to include analysis.")
  }
  readyRole.version = parsingRole.version + 1
  readyRole.jobDescription.rawText = parsingRole.jobDescription.rawText
  readyRole.jobDescription.version = parsingRole.jobDescription.version
  readyRole.jobDescriptionAnalysis.jobDescriptionVersion = parsingRole.jobDescription.version

  const failed = structuredClone(parsing)
  const failedRole = failed.roles[0]!
  if (failedRole.jobDescription.status !== "parsing") {
    throw new Error("Expected the parsing JD fixture.")
  }
  failed.roles[0] = {
    ...failedRole,
    version: failedRole.version + 1,
    jobDescription: {
      ...failedRole.jobDescription,
      status: "failed",
      parsingFailureReason:
        "We could not extract structured requirements from this JD. Please review the text and try again.",
    },
    jobDescriptionAnalysis: null,
  }

  return { failed, initial, parsing, ready }
}

function createReplacementParsingResponse(initial: ReturnType<typeof createRolesMockResponse>) {
  const response = structuredClone(initial)
  const role = response.roles[0]!
  const nextJobDescriptionVersion = (role.jobDescription.version ?? 0) + 1
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    jobDescription: {
      status: "parsing",
      rawText: "A replacement JD for a platform engineering position.",
      version: nextJobDescriptionVersion,
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: null,
    matchingAnalysis:
      role.matchingAnalysis?.status === "current"
        ? { ...role.matchingAnalysis, status: "stale" }
        : role.matchingAnalysis,
  }
  return response
}

function createJobDescriptionRetryResponses() {
  const failed = createRolesMockResponse("roleWithJobDescriptionFailed")
  const failedRole = failed.roles[0]!
  if (failedRole.jobDescription.status !== "failed") {
    throw new Error("Expected the failed JD fixture.")
  }

  const parsing = structuredClone(failed)
  parsing.roles[0] = {
    ...failedRole,
    version: failedRole.version + 1,
    jobDescription: {
      ...failedRole.jobDescription,
      status: "parsing",
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: null,
  }

  const parsedFixture = createRolesMockResponse("roleWithParsedJobDescription").roles[0]!
  if (parsedFixture.jobDescription.status !== "ready" || !parsedFixture.jobDescriptionAnalysis) {
    throw new Error("Expected the ready JD fixture.")
  }
  const parsingRole = parsing.roles[0]!
  if (parsingRole.jobDescription.status !== "parsing") {
    throw new Error("Expected the retry response to be parsing.")
  }
  const ready = structuredClone(parsing)
  ready.roles[0] = {
    ...parsingRole,
    version: parsingRole.version + 1,
    jobDescription: {
      ...parsingRole.jobDescription,
      status: "ready",
    },
    jobDescriptionAnalysis: {
      ...parsedFixture.jobDescriptionAnalysis,
      jobDescriptionVersion: parsingRole.jobDescription.version,
    },
  }

  return { failed, parsing, ready }
}

function createJobDescriptionPollingResponses() {
  const initial = createRolesMockResponse("roleWithJobDescriptionParsing")
  const initialRole = initial.roles[0]!
  if (initialRole.jobDescription.status !== "parsing") {
    throw new Error("Expected the parsing JD fixture.")
  }

  const parsingOne = structuredClone(initial)
  parsingOne.roles[0] = {
    ...initialRole,
    version: initialRole.version + 1,
  }
  const parsingOneRole = parsingOne.roles[0]!
  if (parsingOneRole.jobDescription.status !== "parsing") {
    throw new Error("Expected a parsing JD progression.")
  }
  const parsingTwo = structuredClone(parsingOne)
  parsingTwo.roles[0] = {
    ...parsingOneRole,
    version: parsingOneRole.version + 1,
  }
  const parsingTwoRole = parsingTwo.roles[0]!
  if (parsingTwoRole.jobDescription.status !== "parsing") {
    throw new Error("Expected a parsing JD progression.")
  }

  const parsedFixture = createRolesMockResponse("roleWithParsedJobDescription").roles[0]!
  if (parsedFixture.jobDescription.status !== "ready" || !parsedFixture.jobDescriptionAnalysis) {
    throw new Error("Expected the ready JD fixture.")
  }
  const ready = structuredClone(parsingTwo)
  ready.roles[0] = {
    ...parsingTwoRole,
    version: parsingTwoRole.version + 1,
    jobDescription: {
      ...parsingTwoRole.jobDescription,
      status: "ready",
    },
    jobDescriptionAnalysis: {
      ...parsedFixture.jobDescriptionAnalysis,
      jobDescriptionVersion: parsingTwoRole.jobDescription.version,
    },
  }

  const failed = structuredClone(parsingOne)
  failed.roles[0] = {
    ...parsingOneRole,
    version: parsingOneRole.version + 1,
    jobDescription: {
      ...parsingOneRole.jobDescription,
      status: "failed",
      parsingFailureReason:
        "We could not extract structured requirements from this JD. Please review the text and try again.",
    },
    jobDescriptionAnalysis: null,
  }

  return { failed, initial, parsingOne, parsingTwo, ready }
}

function pollingInput(response: ReturnType<typeof createRolesMockResponse>) {
  const role = response.roles[0]!
  if (role.jobDescription.status !== "parsing") {
    throw new Error("Expected a parsing JD response.")
  }
  return {
    roleId: role.id,
    version: role.version,
    jobDescriptionVersion: role.jobDescription.version,
  }
}

function createReadyResponseFromParsing(
  parsing: ReturnType<typeof createRolesMockResponse>,
  summary: string,
) {
  const response = structuredClone(parsing)
  const role = response.roles[0]!
  if (role.jobDescription.status !== "parsing") {
    throw new Error("Expected a parsing JD response.")
  }
  const parsedFixture = createRolesMockResponse("roleWithParsedJobDescription").roles[0]!
  if (!parsedFixture.jobDescriptionAnalysis) {
    throw new Error("Expected the ready JD fixture to include analysis.")
  }
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    jobDescription: {
      ...role.jobDescription,
      status: "ready",
    },
    jobDescriptionAnalysis: {
      ...parsedFixture.jobDescriptionAnalysis,
      coreRequirementsSummary: summary,
      jobDescriptionVersion: role.jobDescription.version,
    },
  }
  return response
}

function createMatchingAnalysisFlowResponses() {
  const initial = createRolesMockResponse("roleWithParsedJobDescription")
  const generating = createGeneratingMatchingAnalysisResponse(initial)
  const current = createCurrentMatchingAnalysisResponse(generating)
  const failed = createFailedMatchingAnalysisResponse(generating)
  return { current, failed, generating, initial }
}

function createGeneratingMatchingAnalysisResponse(
  initial: ReturnType<typeof createRolesMockResponse>,
) {
  const response = structuredClone(initial)
  const role = response.roles[0]!
  if (
    !response.profileContext.exists ||
    !response.profileContext.completed ||
    role.jobDescription.status !== "ready"
  ) {
    throw new Error("Expected complete matching-analysis prerequisites.")
  }
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    matchingAnalysis: {
      status: "generating",
      profileVersion: response.profileContext.version,
      jobDescriptionVersion: role.jobDescription.version,
      jobDescriptionAnalysisVersion: role.jobDescriptionAnalysis.analysisVersion,
      generatedAt: null,
      failureReason: null,
      result: null,
    },
  }
  return response
}

function createNextGeneratingAnalysisResponse(
  generating: ReturnType<typeof createRolesMockResponse>,
) {
  const response = structuredClone(generating)
  const role = response.roles[0]!
  if (role.matchingAnalysis?.status !== "generating") {
    throw new Error("Expected a generating matching analysis.")
  }
  response.roles[0] = { ...role, version: role.version + 1 }
  return response
}

function createGenerationForNextProfileVersion(
  generating: ReturnType<typeof createRolesMockResponse>,
) {
  const response = structuredClone(generating)
  const role = response.roles[0]!
  if (!response.profileContext.exists || role.matchingAnalysis?.status !== "generating") {
    throw new Error("Expected an existing profile and generating matching analysis.")
  }
  response.profileContext.version += 1
  role.matchingAnalysis.profileVersion = response.profileContext.version
  return response
}

function createCurrentMatchingAnalysisResponse(
  generating: ReturnType<typeof createRolesMockResponse>,
) {
  const response = structuredClone(generating)
  const role = response.roles[0]!
  if (role.matchingAnalysis?.status !== "generating") {
    throw new Error("Expected a generating matching analysis.")
  }
  const currentFixture = createRolesMockResponse("matchingAnalysisCurrent").roles[0]!
  if (currentFixture.matchingAnalysis?.status !== "current") {
    throw new Error("Expected the current matching-analysis fixture.")
  }
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    matchingAnalysis: {
      ...role.matchingAnalysis,
      status: "current",
      generatedAt: "2026-07-18T09:00:00.000Z",
      result: structuredClone(currentFixture.matchingAnalysis.result),
    },
  }
  return response
}

function createFailedMatchingAnalysisResponse(
  generating: ReturnType<typeof createRolesMockResponse>,
) {
  const response = structuredClone(generating)
  const role = response.roles[0]!
  if (role.matchingAnalysis?.status !== "generating") {
    throw new Error("Expected a generating matching analysis.")
  }
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    matchingAnalysis: {
      ...role.matchingAnalysis,
      status: "failed",
      failureReason:
        "The matching analysis could not be generated right now. Your profile and JD are preserved; please try again.",
    },
  }
  return response
}

function matchingPollingInput(response: ReturnType<typeof createRolesMockResponse>) {
  const role = response.roles[0]!
  if (role.matchingAnalysis?.status !== "generating") {
    throw new Error("Expected a generating matching analysis.")
  }
  return { roleId: role.id, version: role.version }
}
