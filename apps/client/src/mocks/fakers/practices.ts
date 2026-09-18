import type { getPracticesApi } from "@/api/generated/endpoints/practices/practices"
import type {
  CreatePracticeRequest,
  CreatePracticeResponse,
  PracticeListResponse,
  PracticeResponse,
  PracticeRoundResponse,
  SubmitPracticeAnswerRequest,
  TaskFailureResponse,
  TaskStatusResponse,
} from "@/api/generated/models"
import { PracticeDifficulty, PracticeQuestionType } from "@/api/generated/models"
import { careerProfileFaker } from "@/mocks/fakers/career-profile"
import { roleFaker } from "@/mocks/fakers/role"
import {
  practiceFollowUpFixture,
  practiceQuestionFixture,
  practiceResultFixture,
  practiceTaskFailureInput,
  practiceTaskFailureFixture,
} from "@/mocks/fixtures/practice"
import { createMockApiError } from "@/mocks/utils"

type Job = {
  action: "start" | "restart" | "answer" | "finish"
  startedAt: number
  fails: boolean
}

const QUEUE_MS = 500
const RUN_MS = 1500

/** API-shaped fake backend. Jobs advance by elapsed time on reads, never by poll count. */
export function createPracticesFaker() {
  const practices = new Map<string, PracticeResponse>()
  const jobs = new Map<string, Job>()
  let activePracticeId: string | null = null
  let sequence = 0

  function nextId() {
    return `30000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
  }

  function conflict(message: string): never {
    throw createMockApiError("resource.conflict", message)
  }

  function findPractice(id: string) {
    const practice = practices.get(id)
    if (!practice) throw createMockApiError("resource.not_found", "Practice session was not found.")
    return practice
  }

  function findRound(practiceId: string, roundId: string) {
    const round = findPractice(practiceId).rounds.find(({ id }) => id === roundId)
    if (!round) throw createMockApiError("resource.not_found", "Practice round was not found.")
    advance(round)
    return round
  }

  function current(practiceId: string, roundId: string) {
    const practice = findPractice(practiceId)
    if (practice.endedAt !== null) conflict("Practice session has ended.")
    const round = practice.rounds.at(-1)!
    if (round.id !== roundId) conflict("The round is not the current round.")
    advance(round)
    return { practice, round }
  }

  function ready(round: PracticeRoundResponse) {
    if (jobs.has(round.id)) conflict("Round has unfinished work; wait or retry the failed task.")
  }

  function enqueue(round: PracticeRoundResponse, action: Job["action"], fails = false) {
    jobs.set(round.id, { action, startedAt: Date.now(), fails })
  }

  function advance(round: PracticeRoundResponse) {
    const job = jobs.get(round.id)
    if (!job || Date.now() - job.startedAt < QUEUE_MS + RUN_MS || job.fails) return
    if (job.action === "start") {
      round.turns.push({ ...structuredClone(practiceQuestionFixture), id: nextId() })
    } else if (job.action === "finish" || (job.action === "answer" && round.turns.length >= 4)) {
      round.result = structuredClone(practiceResultFixture)
    } else if (job.action === "answer") {
      round.turns.push({ ...structuredClone(practiceFollowUpFixture), id: nextId() })
    }
    // Restart already retained the main question; initialization only releases the task lock.
    jobs.delete(round.id)
  }

  function newRound(sequence: number): PracticeRoundResponse {
    return { id: nextId(), sequence, turns: [], result: null }
  }

  async function snapshot(practice: PracticeResponse): Promise<PracticeResponse> {
    practice.rounds.forEach(advance)
    const response = structuredClone(practice)
    const { roles } = await roleFaker.listRoles()
    const role = roles.find(({ id }) => id === practice.role.id)
    response.role = role
      ? { id: role.id, title: role.title, company: role.company }
      : { ...response.role, id: null }
    return response
  }

  return {
    async listPractices(): Promise<PracticeListResponse> {
      const snapshots = await Promise.all([...practices.values()].reverse().map(snapshot))
      return {
        activePracticeId,
        practices: snapshots.map(({ rounds, ...practice }) => {
          const scores = rounds.flatMap(({ result }) => (result ? [result.score] : []))
          return {
            ...practice,
            roundCount: rounds.length,
            completedRoundCount: scores.length,
            averageScore: scores.length
              ? scores.reduce((sum, score) => sum + score, 0) / scores.length
              : null,
          }
        }),
      }
    },

    async createPractice(input: CreatePracticeRequest): Promise<CreatePracticeResponse> {
      if (activePracticeId !== null) conflict("An active practice session already exists.")
      if (
        !Object.values(PracticeQuestionType).includes(input.questionType) ||
        !Object.values(PracticeDifficulty).includes(input.difficulty)
      ) {
        throw createMockApiError("request.validation_failed", "Practice settings are invalid.")
      }
      const { roles } = await roleFaker.listRoles()
      const role = roles.find(({ id }) => id === input.roleId)
      if (!role) throw createMockApiError("resource.not_found", "Target role was not found.")
      await careerProfileFaker.getCareerProfile()
      // Recheck after async prerequisite reads, so concurrent creates cannot create two active sessions.
      if (activePracticeId !== null) conflict("An active practice session already exists.")
      const round = newRound(0)
      const practice: PracticeResponse = {
        id: nextId(),
        role: { id: role.id, title: role.title, company: role.company },
        questionType: input.questionType,
        difficulty: input.difficulty,
        rounds: [round],
        createdAt: new Date().toISOString(),
        endedAt: null,
      }
      practices.set(practice.id, practice)
      activePracticeId = practice.id
      enqueue(round, "start")
      return { id: practice.id }
    },

    async getActivePractice(): Promise<PracticeResponse | void> {
      if (activePracticeId !== null) return snapshot(findPractice(activePracticeId))
    },

    async getPractice(practiceId: string): Promise<PracticeResponse> {
      return snapshot(findPractice(practiceId))
    },

    async getPracticeRound(practiceId: string, roundId: string): Promise<PracticeRoundResponse> {
      return structuredClone(findRound(practiceId, roundId))
    },

    async deletePractice(practiceId: string): Promise<void> {
      const practice = findPractice(practiceId)
      practice.rounds.forEach(({ id }) => jobs.delete(id))
      practices.delete(practiceId)
      if (activePracticeId === practiceId) activePracticeId = null
    },

    async submitPracticeAnswer(
      practiceId: string,
      roundId: string,
      input: SubmitPracticeAnswerRequest,
    ): Promise<void> {
      const { round } = current(practiceId, roundId)
      if (typeof input.content !== "string" || !input.content.trim()) {
        throw createMockApiError("request.validation_failed", "Answer content must not be blank.")
      }
      const content = input.content.trim()
      const index = round.turns.findIndex(
        ({ id, role }) => id === input.questionId && role === "assistant",
      )
      if (index < 0) conflict("The question is not part of this round.")
      const existing = round.turns[index + 1]
      if (existing) {
        if (existing.role === "user" && existing.content === content) return
        conflict("This question already has a different answer.")
      }
      ready(round)
      if (round.result !== null || round.turns.at(-1)?.role !== "assistant") {
        conflict("Round is not waiting for an answer.")
      }
      round.turns.push({ id: nextId(), role: "user", content })
      enqueue(round, "answer", content === practiceTaskFailureInput)
    },

    async skipPracticeRound(practiceId: string, roundId: string): Promise<void> {
      const { practice, round } = current(practiceId, roundId)
      ready(round)
      if (round.result !== null || round.turns.length !== 1)
        conflict("Only an unanswered main question can be skipped.")
      const replacement = newRound(round.sequence)
      practice.rounds.splice(-1, 1, replacement)
      enqueue(replacement, "start")
    },

    async finishPracticeRound(practiceId: string, roundId: string): Promise<void> {
      const { round } = current(practiceId, roundId)
      ready(round)
      if (
        round.result !== null ||
        round.turns.length < 3 ||
        round.turns.at(-1)?.role !== "assistant"
      ) {
        conflict("Round must be waiting for a follow-up answer.")
      }
      round.turns.pop()
      enqueue(round, "finish")
    },

    async restartPracticeRound(practiceId: string, roundId: string): Promise<void> {
      const { practice, round } = current(practiceId, roundId)
      ready(round)
      if (round.result === null) conflict("Round must be completed before retrying.")
      const replacement = newRound(round.sequence)
      replacement.turns.push(structuredClone(round.turns[0]))
      practice.rounds.splice(-1, 1, replacement)
      enqueue(replacement, "restart")
    },

    async startNextPracticeRound(practiceId: string, roundId: string): Promise<void> {
      const { practice, round } = current(practiceId, roundId)
      ready(round)
      if (round.result === null) conflict("Round must be completed before starting the next round.")
      const next = newRound(round.sequence + 1)
      practice.rounds.push(next)
      enqueue(next, "start")
    },

    async endPracticeSession(practiceId: string, roundId: string): Promise<void> {
      const { practice, round } = current(practiceId, roundId)
      ready(round)
      if (round.result === null) conflict("Complete the current round before ending the session.")
      practice.endedAt = new Date().toISOString()
      activePracticeId = null
    },

    async getPracticeTaskState(
      practiceId: string,
      roundId: string,
    ): Promise<TaskStatusResponse | TaskFailureResponse> {
      const round = findRound(practiceId, roundId)
      const job = jobs.get(round.id)
      if (!job) return { status: "idle", error: null }
      const elapsed = Date.now() - job.startedAt
      if (elapsed >= QUEUE_MS + RUN_MS) return structuredClone(practiceTaskFailureFixture)
      return { status: elapsed < QUEUE_MS ? "queued" : "running", error: null }
    },

    async retryPracticeTask(practiceId: string, roundId: string): Promise<void> {
      const { round } = current(practiceId, roundId)
      const job = jobs.get(round.id)
      if (!job || !job.fails || Date.now() - job.startedAt < QUEUE_MS + RUN_MS) {
        conflict("Only a failed task can be retried.")
      }
      enqueue(round, job.action)
    },
  } satisfies ReturnType<typeof getPracticesApi>
}

export const practicesFaker = createPracticesFaker()
