import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { userMock } from "@/mocks/data/auth"
import type { RolesPageResponseDto } from "@/models/roles"
import { RolesPage } from "@/pages/roles"
import { renderWithProviders } from "@/test/render"
import { useAuthStore } from "@/stores/auth"

const roleId = "11111111-1111-4111-8111-111111111111"
function createResponse(
  status: "saved" | "parsing",
  version: number,
  jobDescriptionVersion: number,
): RolesPageResponseDto {
  const roleBase = {
    company: "Riva",
    createdAt: "2026-07-30T08:00:00Z",
    experienceRange: null,
    id: roleId,
    location: null,
    matchingAnalysis: null,
    preparationStatus: "paused" as const,
    recruitmentType: "experienced" as const,
    title: "Backend Engineer",
    updatedAt: "2026-07-30T09:00:00Z",
    version,
  }
  const role =
    status === "saved"
      ? {
          ...roleBase,
          jobDescription: {
            parsingFailureReason: null,
            rawText: "Design and build reliable APIs.",
            status: "saved" as const,
            version: jobDescriptionVersion,
          },
          jobDescriptionAnalysis: null,
        }
      : {
          ...roleBase,
          jobDescription: {
            parsingFailureReason: null,
            rawText: "Design and build reliable APIs.",
            status: "parsing" as const,
            version: jobDescriptionVersion,
          },
          jobDescriptionAnalysis: null,
        }

  return {
    currentRoleId: roleId,
    profileContext: { completed: true, exists: true, version: 2 },
    roles: [role],
  }
}

const response = createResponse("saved", 2, 1)

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function requestJson(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index: number) {
  const body = fetchMock.mock.calls[index]?.[1]?.body
  if (typeof body !== "string") throw new TypeError("Expected a JSON request body.")
  return JSON.parse(body) as unknown
}

describe("RolesPage Target Roles API capabilities", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse(response))
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("saves JD then starts parsing with the versions returned by PUT", async () => {
    const user = userEvent.setup()
    const saved = createResponse("saved", 5, 3)
    const parsing = createResponse("parsing", 6, 3)
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(jsonResponse(saved))
      .mockResolvedValueOnce(jsonResponse(parsing, 202))
      .mockResolvedValueOnce(jsonResponse(parsing.roles[0]!))

    const { queryClient } = renderWithProviders(<RolesPage />, {
      router: { initialEntries: ["/roles"] },
    })

    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.jd.actions.replace") }),
    )
    const dialog = await screen.findByRole("dialog")
    const textarea = within(dialog).getByLabelText(i18n.t("roles.jd.editor.fieldLabel"))
    await user.clear(textarea)
    await user.type(textarea, "Design and build reliable APIs with strong observability.")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(parsing))
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/roles")
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/roles/${roleId}/job-description`)
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT")
    expect(requestJson(fetchMock, 1)).toMatchObject({ version: response.roles[0]!.version })
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`/api/roles/${roleId}/job-description/parsing`)
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("POST")
    expect(requestJson(fetchMock, 2)).toEqual({ version: 5, jobDescriptionVersion: 3 })
    expect(requestJson(fetchMock, 2)).not.toHaveProperty("roleId")
    expect(
      screen.getByText(i18n.t("roles.jobDescriptionStatus.parsing.description")),
    ).toBeInTheDocument()
  })

  it("does not start parsing when saving JD fails", async () => {
    const user = userEvent.setup()
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(jsonResponse({ error: "validation_error" }, 422))

    renderWithProviders(<RolesPage />, { router: { initialEntries: ["/roles"] } })

    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.jd.actions.replace") }),
    )
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))

    expect(
      await within(dialog).findByText(i18n.t("roles.errors.requestFailed")),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/roles/${roleId}/job-description`)
  })

  it("keeps saved JD state and exposes manual parsing after POST fails", async () => {
    const user = userEvent.setup()
    const saved = createResponse("saved", 5, 3)
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(jsonResponse(saved))
      .mockResolvedValueOnce(jsonResponse({ error: "matching_analysis_unavailable" }, 503))

    const { queryClient } = renderWithProviders(<RolesPage />, {
      router: { initialEntries: ["/roles"] },
    })

    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.jd.actions.replace") }),
    )
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(saved))
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.cancel") }))
    const card = await screen.findByTestId("job-description-card")
    expect(within(card).getByTestId("saved-job-description")).toBeInTheDocument()
    expect(
      within(card).getByRole("button", { name: i18n.t("roles.jd.actions.startParsing") }),
    ).toBeEnabled()
  })

  it("starts parsing a saved JD from the recovery action", async () => {
    const user = userEvent.setup()
    const parsing = createResponse("parsing", 3, 1)
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(jsonResponse(parsing, 202))
      .mockResolvedValueOnce(jsonResponse(parsing.roles[0]!))

    const { queryClient } = renderWithProviders(<RolesPage />, {
      router: { initialEntries: ["/roles"] },
    })

    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    const card = await screen.findByTestId("job-description-card")
    await user.click(
      within(card).getByRole("button", { name: i18n.t("roles.jd.actions.startParsing") }),
    )

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(parsing))
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/roles/${roleId}/job-description/parsing`)
    expect(requestJson(fetchMock, 1)).toEqual({
      version: response.roles[0]!.version,
      jobDescriptionVersion: 1,
    })
  })

  it("shows saved JD text and exposes the real analysis capabilities", async () => {
    const user = userEvent.setup()
    renderWithProviders(<RolesPage />, { router: { initialEntries: ["/roles"] } })

    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))

    const card = await screen.findByTestId("job-description-card")
    expect(within(card).getByTestId("saved-job-description")).toHaveTextContent(
      "Design and build reliable APIs.",
    )
    expect(within(card).getByText(i18n.t("roles.jd.saved.description"))).toBeInTheDocument()
    expect(
      screen.queryByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }),
    ).toBeInTheDocument()
    expect(
      within(card).queryByRole("button", { name: i18n.t("roles.jd.actions.retry") }),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("hands a 401 to the authentication invalidation flow and clears cached user data", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not_authenticated" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      }),
    )
    useAuthStore.getState().setCurrentUser(userMock)
    const { queryClient } = renderWithProviders(<RolesPage />, {
      router: { initialEntries: ["/roles"] },
    })
    queryClient.setQueryData(["profile"], { user: "previous" })

    await waitFor(() => expect(useAuthStore.getState().currentUser).toBeNull())
    expect(queryClient.getQueryData(["profile"])).toBeUndefined()
    expect(queryClient.getQueryData(["roles"])).toBeUndefined()
  })
})
