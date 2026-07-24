import { describe, expect, it } from "vitest"

import { createPracticeMockResponse } from "@/mocks/data/practice"

import { synchronizePracticeSessionMutationResponse } from "./practice-cache"

describe("practice cache", () => {
  it("accepts only a newer completed response for the same session-ending request", () => {
    const current = createPracticeMockResponse("reviewBalanced")
    const completed = createPracticeMockResponse("completedSession")
    if (current.session.status !== "review" || completed.session.status !== "completed") return
    completed.session.sessionId = current.session.sessionId
    completed.session.version = current.session.version + 1
    const request = { sessionId: current.session.sessionId, version: current.session.version }
    expect(synchronizePracticeSessionMutationResponse(current, completed, request)).toBe(completed)
    completed.session.version = current.session.version
    expect(synchronizePracticeSessionMutationResponse(current, completed, request)).toBe(current)
    completed.session.version = current.session.version + 1
    completed.session.sessionId = "other_session"
    expect(synchronizePracticeSessionMutationResponse(current, completed, request)).toBe(current)
  })
})
