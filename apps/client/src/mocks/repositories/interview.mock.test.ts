import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

function stubSessionStorage(overrides: Partial<Storage>) {
  const storage = globalThis.sessionStorage
  vi.stubGlobal("sessionStorage", {
    get length() {
      return storage.length
    },
    clear: storage.clear.bind(storage),
    getItem: storage.getItem.bind(storage),
    key: storage.key.bind(storage),
    removeItem: storage.removeItem.bind(storage),
    setItem: storage.setItem.bind(storage),
    ...overrides,
  } satisfies Storage)
}

beforeEach(() => {
  clearCompletedInterviewSessions()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  clearCompletedInterviewSessions()
})

describe("interview Mock repository", () => {
  it("saves and reads a completed session", () => {
    const session = completedSession("mock-interview-session-1")

    saveCompletedInterviewSession(session)

    expect(getCompletedInterviewSession(session.sessionId)).toEqual(session)
    expect(listCompletedInterviewSessions()).toEqual([session])
  })

  it("preserves the session language when reading persisted history", () => {
    const session = createInterviewCompletedSessionMock({ language: "en" })

    saveCompletedInterviewSession(session)

    expect(getCompletedInterviewSession(session.sessionId)?.language).toBe("en")
  })

  it("defaults legacy persisted sessions to zh-CN", () => {
    const session = completedSession("legacy-interview-session")
    const { language: _language, ...legacySession } = session
    sessionStorage.setItem(
      INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY,
      JSON.stringify({ version: 1, sessions: [legacySession] }),
    )

    expect(getCompletedInterviewSession(session.sessionId)?.language).toBe("zh-CN")
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
    firstRead.questionDetails[0]!.referenceAnswer = {
      status: "unavailable",
      reason: "generationFailed",
    }

    expect(getCompletedInterviewSession(session.sessionId)).toEqual(expected)
  })

  it("keeps multiple sessions in memory when storage writes fail", () => {
    stubSessionStorage({
      setItem: vi.fn(() => {
        throw new Error("Storage is unavailable.")
      }),
    })
    const first = completedSession("mock-interview-session-1")
    const second = completedSession("mock-interview-session-2")

    expect(() => saveCompletedInterviewSession(first)).not.toThrow()
    expect(() => saveCompletedInterviewSession(second)).not.toThrow()

    expect(getCompletedInterviewSession(first.sessionId)).toEqual(first)
    expect(getCompletedInterviewSession(second.sessionId)).toEqual(second)
    expect(listCompletedInterviewSessions()).toEqual([first, second])
  })

  it("reads an isolated memory snapshot when storage reads fail", () => {
    const session = completedSession("mock-interview-session-1")
    saveCompletedInterviewSession(session)
    stubSessionStorage({
      getItem: vi.fn(() => {
        throw new Error("Storage is unavailable.")
      }),
    })

    const firstRead = getCompletedInterviewSession(session.sessionId)
    if (firstRead === null) throw new Error("Expected volatile session.")
    firstRead.completedQuestions[0]!.answer.content = "调用方修改后的答案"

    expect(getCompletedInterviewSession(session.sessionId)).toEqual(session)
  })

  it("uses the memory snapshot when storage has no value", () => {
    const session = completedSession("mock-interview-session-1")
    saveCompletedInterviewSession(session)
    stubSessionStorage({ getItem: vi.fn(() => null) })

    expect(getCompletedInterviewSession(session.sessionId)).toEqual(session)
  })

  it("prefers valid storage and synchronizes it back to memory", () => {
    const oldSession = completedSession("mock-interview-session-old")
    const storedSession = completedSession("mock-interview-session-stored")
    saveCompletedInterviewSession(oldSession)
    sessionStorage.setItem(
      INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY,
      JSON.stringify({ version: 1, sessions: [storedSession] }),
    )

    expect(listCompletedInterviewSessions()).toEqual([storedSession])

    stubSessionStorage({
      getItem: vi.fn(() => {
        throw new Error("Storage is unavailable.")
      }),
    })
    expect(listCompletedInterviewSessions()).toEqual([storedSession])
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
    saveCompletedInterviewSession(completedSession("stale-volatile-session"))
    sessionStorage.setItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY, serialized)

    expect(listCompletedInterviewSessions()).toEqual([])
    expect(sessionStorage.getItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY)).toBeNull()
    expect(listCompletedInterviewSessions()).toEqual([])
  })

  it("clears every persisted session explicitly", () => {
    saveCompletedInterviewSession(completedSession("mock-interview-session-1"))
    saveCompletedInterviewSession(completedSession("mock-interview-session-2"))

    clearCompletedInterviewSessions()

    expect(listCompletedInterviewSessions()).toEqual([])
    expect(sessionStorage.getItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY)).toBeNull()
  })

  it("keeps memory cleared when removing persisted state fails", () => {
    saveCompletedInterviewSession(completedSession("mock-interview-session-1"))
    const removeItem = vi.fn(() => {
      throw new Error("Storage is unavailable.")
    })
    stubSessionStorage({ removeItem })

    expect(() => clearCompletedInterviewSessions()).not.toThrow()
    expect(removeItem).toHaveBeenCalledWith(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY)
    expect(listCompletedInterviewSessions()).toEqual([])

    vi.unstubAllGlobals()
    expect(listCompletedInterviewSessions()).toEqual([])
  })
})
