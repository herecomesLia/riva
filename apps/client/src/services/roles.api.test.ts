import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import type { RolesPageResponseDto } from "@/models/roles"
import { ApiError } from "@/services/api"
import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  getRolesPage,
  saveJobDescription,
  setCurrentTargetRole,
  updateRolePreparationStatus,
  updateTargetRole,
} from "@/services/roles"

const roleId = "11111111-1111-4111-8111-111111111111"

function createResponse(status: "missing" | "saved" = "missing"): RolesPageResponseDto {
  return {
    currentRoleId: roleId,
    profileContext: { completed: true, exists: true, version: 4 },
    roles: [
      {
        company: "Riva",
        createdAt: "2026-07-30T08:00:00Z",
        experienceRange: { maxYears: 5, minYears: 2 },
        id: roleId,
        jobDescription:
          status === "saved"
            ? {
                parsingFailureReason: null,
                rawText: "Build reliable APIs.",
                status: "saved",
                version: 2,
              }
            : {
                parsingFailureReason: null,
                rawText: null,
                status: "missing",
                version: null,
              },
        jobDescriptionAnalysis: null,
        location: "Shanghai",
        matchingAnalysis: null,
        preparationStatus: "paused",
        recruitmentType: "experienced",
        title: "Backend Engineer",
        updatedAt: "2026-07-30T09:00:00Z",
        version: 3,
      },
    ],
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function requestJson(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  const body = fetchMock.mock.calls[index]?.[1]?.body
  if (typeof body !== "string") throw new TypeError("Expected a JSON request body.")
  return JSON.parse(body) as unknown
}

describe("roles service API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(["missing", "saved"] as const)(
    "maps a %s JD without inventing analysis",
    async (status) => {
      const response = createResponse(status)
      fetchMock.mockResolvedValueOnce(jsonResponse(response))

      const result = await getRolesPage()

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/roles",
        expect.objectContaining({ credentials: "include" }),
      )
      expect(result).toEqual(response)
      expect(result.roles[0]).toMatchObject({
        jobDescription: { status },
        jobDescriptionAnalysis: null,
        matchingAnalysis: null,
        preparationStatus: "paused",
      })
    },
  )

  it("uses POST /roles and the server camelCase create body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createResponse(), 201))
    const input = {
      company: "Riva",
      experienceRange: { maxYears: 5, minYears: 2 },
      location: "Shanghai",
      preparationStatus: "preparing" as const,
      recruitmentType: "experienced" as const,
      title: "Backend Engineer",
    }

    await createTargetRole(input)

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/roles")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(requestJson(fetchMock)).toEqual(input)
  })

  it("uses PATCH /roles/{roleId} without putting roleId in the body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createResponse()))

    await updateTargetRole({
      company: null,
      experienceRange: null,
      location: null,
      recruitmentType: null,
      roleId,
      title: "Platform Engineer",
      version: 3,
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/roles/${roleId}`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH")
    expect(requestJson(fetchMock)).toEqual({
      company: null,
      experienceRange: null,
      location: null,
      recruitmentType: null,
      title: "Platform Engineer",
      version: 3,
    })
  })

  it.each([
    {
      call: () => setCurrentTargetRole({ roleId, version: 3 }),
      body: { version: 3 },
      method: "PUT",
      path: `/api/roles/${roleId}/current`,
    },
    {
      call: () =>
        updateRolePreparationStatus({
          preparationStatus: "paused",
          roleId,
          version: 3,
        }),
      body: { preparationStatus: "paused", version: 3 },
      method: "PATCH",
      path: `/api/roles/${roleId}/preparation-status`,
    },
    {
      call: () => archiveTargetRole({ roleId, version: 3 }),
      body: { version: 3 },
      method: "POST",
      path: `/api/roles/${roleId}/archive`,
    },
    {
      call: () =>
        saveJobDescription({
          rawText: "Build reliable APIs.",
          roleId,
          version: 3,
        }),
      body: { rawText: "Build reliable APIs.", version: 3 },
      method: "PUT",
      path: `/api/roles/${roleId}/job-description`,
    },
  ])("uses $method $path with the exact mutation body", async ({ body, call, method, path }) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createResponse("saved")))

    await call()

    expect(fetchMock.mock.calls[0]?.[0]).toBe(path)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe(method)
    expect(requestJson(fetchMock)).toEqual(body)
  })

  it("sends DELETE version in the query and no JSON body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(createResponse()))

    await deleteTargetRole({ roleId, version: 3 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/roles/${roleId}?version=3`)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: undefined,
      credentials: "include",
      method: "DELETE",
    })
  })

  it.each([
    [404, "target_role_not_found"],
    [409, "target_role_version_conflict"],
    [409, "target_role_state_conflict"],
    [422, "validation_error"],
    [401, "not_authenticated"],
  ] as const)("preserves %i %s as a structured ApiError", async (status, code) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: code }, status))

    const error = await setCurrentTargetRole({ roleId, version: 3 }).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ body: { error: code }, code, status })
  })

  it("rejects invalid role responses", async () => {
    const response = createResponse()
    response.roles[0]!.id = "role_with_prefix"
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    await expect(getRolesPage()).rejects.toBeInstanceOf(ZodError)
  })

  it("rejects archived current roles", async () => {
    const response = createResponse()
    response.roles[0]!.preparationStatus = "archived"
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    await expect(getRolesPage()).rejects.toBeInstanceOf(ZodError)
  })

  it("retains archived roles when there is no current role", async () => {
    const response = createResponse()
    response.currentRoleId = null
    response.roles[0]!.preparationStatus = "archived"
    fetchMock.mockResolvedValueOnce(jsonResponse(response))

    await expect(getRolesPage()).resolves.toMatchObject({
      currentRoleId: null,
      roles: [{ id: roleId, preparationStatus: "archived" }],
    })
  })
})
