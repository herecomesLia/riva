import { beforeEach, vi } from "vitest"
import type {
  PracticeResponse,
  TaskFailureResponse,
  TaskStatusResponse,
} from "@/api/generated/models"
import { practiceResponseFixture } from "@/mocks/fixtures/practice"
import { roleFixture, roleListFixture } from "@/mocks/fixtures/role"
import { PracticePage } from "@/pages/practice"
import * as api from "./practice-page-test-api"
import { renderWithProviders } from "@/test/render"

export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

export function practiceAt(
  stage: "generating" | "answering" | "processing" | "followUp" | "review" | "completed",
) {
  const practice = structuredClone(practiceResponseFixture)
  practice.role = { id: roleFixture.id, title: roleFixture.title, company: roleFixture.company }
  const round = practice.rounds[0]
  if (stage !== "review" && stage !== "completed") round.result = null
  if (stage === "generating") round.turns = []
  if (stage === "answering") round.turns = round.turns.slice(0, 1)
  if (stage === "processing") round.turns = round.turns.slice(0, 2)
  if (stage === "followUp") round.turns = round.turns.slice(0, 3)
  if (stage === "completed") practice.endedAt = "2026-09-18T09:00:00Z"
  return practice
}

export function mockPractice(
  practice: PracticeResponse | null,
  task: TaskStatusResponse | TaskFailureResponse = { status: "idle", error: null },
) {
  vi.mocked(api.getActivePractice).mockImplementation(async () =>
    practice?.endedAt === null ? structuredClone(practice) : undefined,
  )
  vi.mocked(api.getPractice).mockImplementation(async () => {
    if (!practice) throw new Error("Missing fixture.")
    return structuredClone(practice)
  })
  vi.mocked(api.getPracticeRound).mockImplementation(async () => {
    if (!practice) throw new Error("Missing fixture.")
    return structuredClone(practice.rounds.at(-1)!)
  })
  vi.mocked(api.getPracticeTaskState).mockResolvedValue(task)
}

export function renderPracticePage(initialEntry = "/practice") {
  return renderWithProviders(<PracticePage />, { router: { initialEntries: [initialEntry] } })
}

beforeEach(() => {
  Object.values(api).forEach((value) => {
    if (vi.isMockFunction(value)) value.mockReset()
  })
  vi.mocked(api.listRoles).mockResolvedValue(structuredClone(roleListFixture))
  mockPractice(null)
})
