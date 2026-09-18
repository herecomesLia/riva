import { vi } from "vitest"

vi.mock("@/services/practice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/practice")>()),
  getPracticePage: vi.fn(),
  getPracticeTaskStatus: vi.fn(),
  retryPracticeTask: vi.fn(),
  endPracticeFollowUps: vi.fn(),
  endPracticeSession: vi.fn(),
  retryCurrentPracticeQuestion: vi.fn(),
  continueToNextPracticeQuestion: vi.fn(),
  prepareNextPracticeSession: vi.fn(),
  preparePracticeTrainingEntry: vi.fn(),
  skipPracticeQuestion: vi.fn(),
  startPracticeSession: vi.fn(),
  submitFollowUpAnswer: vi.fn(),
  submitPrimaryAnswer: vi.fn(),
}))
