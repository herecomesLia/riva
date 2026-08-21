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

describe("RolesPage Target Roles API capabilities", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse(response))
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
