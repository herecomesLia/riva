import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createRolesMockResponse } from "@/mocks/data/roles"
import { RolesPage } from "@/pages/roles"
import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  getJobDescriptionParsingStatus,
  getRolesPage,
  saveJobDescription,
  setCurrentTargetRole,
  startJobDescriptionParsing,
  updateRolePreparationStatus,
  updateTargetRole,
} from "@/services/roles"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/roles")>()),
  getRolesPage: vi.fn(),
  archiveTargetRole: vi.fn(),
  createTargetRole: vi.fn(),
  deleteTargetRole: vi.fn(),
  getJobDescriptionParsingStatus: vi.fn(),
  saveJobDescription: vi.fn(),
  setCurrentTargetRole: vi.fn(),
  startJobDescriptionParsing: vi.fn(),
  updateRolePreparationStatus: vi.fn(),
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
  saveJobDescription,
  setCurrentTargetRole,
  startJobDescriptionParsing,
  updateRolePreparationStatus,
  updateTargetRole,
] as const

describe("RolesPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getRolesPage).mockReset()
    vi.mocked(getJobDescriptionParsingStatus).mockReset()
    mutationMocks.forEach((mutation) => vi.mocked(mutation).mockReset())
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
      await screen.findByText(i18n.t("roles.matchingAnalysisStatus.stale.label")),
    ).toBeInTheDocument()
  })
})

async function submitJobDescription(user: ReturnType<typeof userEvent.setup>, rawText: string) {
  await screen.findByTestId("job-description-card")
  await user.click(screen.getByRole("button", { name: i18n.t("roles.jd.actions.add") }))
  const dialog = await screen.findByRole("dialog")
  await user.type(within(dialog).getByLabelText(i18n.t("roles.jd.editor.fieldLabel")), rawText)
  await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))
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
