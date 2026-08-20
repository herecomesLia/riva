import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetJobDescriptionImportMockState } from "@/mocks/services/job-description-import"
import { resetRolesMockState } from "@/mocks/services/roles"
import {
  applyJobDescriptionImportDraft,
  createJobDescriptionImportDraft,
  getJobDescriptionImportDraft,
} from "@/services/job-description-import"
import { getRolesPage } from "@/services/roles"

describe("job description import service in mock mode", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetJobDescriptionImportMockState()
    resetRolesMockState("noRoles")
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function settle<T>(promise: Promise<T>) {
    await vi.runAllTimersAsync()
    return promise
  }

  it("moves a draft from parsing to ready and applies it to the roles mock", async () => {
    const parsing = await settle(
      createJobDescriptionImportDraft({ rawText: "Senior frontend role in Shanghai." }),
    )
    expect(parsing.status).toBe("parsing")

    const ready = await settle(getJobDescriptionImportDraft(parsing.id))
    expect(ready).toMatchObject({ canApply: true, status: "ready" })

    const applied = await settle(applyJobDescriptionImportDraft(ready.id))
    expect(applied).toMatchObject({ canApply: false, status: "applied" })
    const roles = await settle(getRolesPage())
    expect(roles.currentRoleId).toBe(applied.appliedRoleId)
    expect(roles.roles[0]).toMatchObject({
      id: applied.appliedRoleId,
      jobDescription: { status: "ready" },
      title: ready.parsedTitle,
    })
  })

  it("exposes a failed parsing draft for unparseable mock input", async () => {
    const parsing = await settle(
      createJobDescriptionImportDraft({ rawText: "unparseable job description" }),
    )

    const failed = await settle(getJobDescriptionImportDraft(parsing.id))

    expect(failed.status).toBe("failed")
    expect(failed.failureReason).toBeTruthy()
    expect(failed.canApply).toBe(false)
  })
})
