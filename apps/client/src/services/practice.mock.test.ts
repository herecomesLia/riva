import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetPracticeMockState } from "@/mocks/services/practice"
import { resetRolesMockState } from "@/mocks/services/roles"
import {
  getPracticePage,
  getQuestionGenerationStatus,
  startPracticeSession,
} from "@/services/practice"

beforeEach(() => {
  vi.useFakeTimers()
  resetRolesMockState("multipleRoles")
  resetPracticeMockState()
})

afterEach(() => {
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>) {
  await vi.runAllTimersAsync()
  return promise
}

describe("practice stateful mock service", () => {
  it("projects current target-role data from the roles mock service", async () => {
    const response = await settle(getPracticePage())

    expect(response.setupContext.defaultTargetRoleId).toBe("role_frontend_bytedance")
    expect(response.setupContext.targetRoles).toHaveLength(2)
    expect(response.setupContext.targetRoles[1]).toMatchObject({
      id: "role_product_manager_meituan",
      title: "Product Manager",
      company: "Meituan",
    })
  })

  it("moves from setup through generation to an answering snapshot", async () => {
    const setup = await settle(getPracticePage())
    if (setup.session.selection.targetRoleId === null) {
      throw new Error("The default practice setup must select a target role.")
    }

    const generating = await settle(
      startPracticeSession({
        ...setup.session.selection,
        targetRoleId: setup.session.selection.targetRoleId,
      }),
    )
    expect(generating.session).toMatchObject({ status: "generatingQuestion", version: 1 })
    if (generating.session.status !== "generatingQuestion") return

    const pollInput = {
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    }
    const stillGenerating = await settle(getQuestionGenerationStatus(pollInput))
    const answering = await settle(getQuestionGenerationStatus(pollInput))

    expect(stillGenerating.session.status).toBe("generatingQuestion")
    expect(answering.session).toMatchObject({
      status: "answering",
      sessionId: generating.session.sessionId,
      version: 2,
    })
  })

  it("rejects stale polling without overwriting a newer session", async () => {
    const setup = await settle(getPracticePage())
    const roleId = setup.setupContext.defaultTargetRoleId
    if (!roleId) throw new Error("The default practice setup must include a current role.")

    const first = await settle(
      startPracticeSession({ ...setup.session.selection, targetRoleId: roleId }),
    )
    if (first.session.status !== "generatingQuestion") return

    const second = await settle(
      startPracticeSession({ ...first.session.selection, difficulty: "pressure" }),
    )
    const stalePoll = getQuestionGenerationStatus({
      sessionId: first.session.sessionId,
      version: first.session.version,
    })
    const staleAssertion = expect(stalePoll).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await staleAssertion

    const current = await settle(getPracticePage())
    expect(current.session).toEqual(second.session)
  })

  it("returns independent deep copies", async () => {
    const first = await settle(getPracticePage())
    const second = await settle(getPracticePage())
    const firstRole = first.setupContext.targetRoles[0]
    if (!firstRole) throw new Error("Expected a target role fixture.")

    firstRole.title = "Mutated role"

    expect(second.setupContext.targetRoles[0]?.title).toBe("Senior Frontend Engineer")
    expect(first).not.toBe(second)
    expect(first.setupContext).not.toBe(second.setupContext)
  })
})
