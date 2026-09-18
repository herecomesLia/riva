import { vi } from "vitest"

vi.mock("@/services/practices", () => ({
  getActivePractice: vi.fn(),
  getPractice: vi.fn(),
  getPracticeRound: vi.fn(),
  getPracticeTaskState: vi.fn(),
  createPractice: vi.fn(),
  submitPracticeAnswer: vi.fn(),
  skipPracticeRound: vi.fn(),
  finishPracticeRound: vi.fn(),
  restartPracticeRound: vi.fn(),
  startNextPracticeRound: vi.fn(),
  endPracticeSession: vi.fn(),
  retryPracticeTask: vi.fn(),
  deletePractice: vi.fn(),
}))
vi.mock("@/services/roles", () => ({ listRoles: vi.fn() }))
