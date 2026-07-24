import { beforeEach, describe, expect, it } from "vitest"

import { createInterviewCompletedSessionMock } from "@/mocks/data/interview"
import {
  clearCompletedInterviewSessions,
  getCompletedInterviewSession,
  INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY,
  listCompletedInterviewSessions,
  saveCompletedInterviewSession,
} from "@/mocks/repositories/interview"

function completedSession(sessionId: string) {
  const session = createInterviewCompletedSessionMock({ completedMainQuestions: 2 })
  session.sessionId = sessionId
  return session
}

beforeEach(() => {
  clearCompletedInterviewSessions()
})

describe("interview Mock repository", () => {
  it("saves and reads a completed session", () => {
    const session = completedSession("mock-interview-session-1")

    saveCompletedInterviewSession(session)

    expect(getCompletedInterviewSession(session.sessionId)).toEqual(session)
    expect(listCompletedInterviewSessions()).toEqual([session])
  })

  it("keeps multiple sessions without overwriting one another", () => {
    const first = completedSession("mock-interview-session-1")
    const second = completedSession("mock-interview-session-2")

    saveCompletedInterviewSession(first)
    saveCompletedInterviewSession(second)

    expect(getCompletedInterviewSession(first.sessionId)).toEqual(first)
    expect(getCompletedInterviewSession(second.sessionId)).toEqual(second)
    expect(listCompletedInterviewSessions()).toHaveLength(2)
  })

  it("deep-copies values at both the save and read boundaries", () => {
    const session = completedSession("mock-interview-session-1")
    const expected = structuredClone(session)
    saveCompletedInterviewSession(session)

    session.completedQuestions[0]!.answer.content = "保存后修改的答案"
    const firstRead = getCompletedInterviewSession(session.sessionId)
    if (firstRead === null) throw new Error("Expected persisted session.")
    firstRead.completedQuestions[0]!.answer.content = "读取后修改的答案"
    firstRead.questionDetails[0]!.referenceAnswer = { status: "generating" }

    expect(getCompletedInterviewSession(session.sessionId)).toEqual(expected)
  })

  it.each([
    ["损坏的 JSON", "not-json"],
    ["旧结构", JSON.stringify({ version: 0, sessions: [] })],
    [
      "不合法的会话",
      JSON.stringify({
        version: 1,
        sessions: [{ status: "completed", sessionId: "incomplete-record" }],
      }),
    ],
  ])("safely discards %s", (_label, serialized) => {
    sessionStorage.setItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY, serialized)

    expect(listCompletedInterviewSessions()).toEqual([])
    expect(sessionStorage.getItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY)).toBeNull()
  })

  it("clears every persisted session explicitly", () => {
    saveCompletedInterviewSession(completedSession("mock-interview-session-1"))
    saveCompletedInterviewSession(completedSession("mock-interview-session-2"))

    clearCompletedInterviewSessions()

    expect(listCompletedInterviewSessions()).toEqual([])
    expect(sessionStorage.getItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY)).toBeNull()
  })
})
