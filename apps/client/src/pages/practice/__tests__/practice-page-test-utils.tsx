import { beforeEach, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"
import { PracticePage } from "@/pages/practice"
import {
  endPracticeFollowUps,
  getPracticePage,
  getPracticeTaskStatus,
  retryPracticeTask,
  endPracticeSession,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  prepareNextPracticeSession,
  preparePracticeTrainingEntry,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
} from "@/services/practice"
import { renderWithProviders } from "@/test/render"

export function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

export function renderPracticePage(initialEntry = "/practice") {
  return renderWithProviders(<PracticePage />, {
    router: { initialEntries: [initialEntry] },
  })
}

beforeEach(async () => {
  await i18n.changeLanguage(defaultLanguage)
  vi.mocked(getPracticePage).mockReset()
  vi.mocked(getPracticeTaskStatus).mockReset()
  vi.mocked(retryPracticeTask).mockReset()
  vi.mocked(endPracticeFollowUps).mockReset()
  vi.mocked(endPracticeSession).mockReset()
  vi.mocked(retryCurrentPracticeQuestion).mockReset()
  vi.mocked(continueToNextPracticeQuestion).mockReset()
  vi.mocked(prepareNextPracticeSession).mockReset()
  vi.mocked(preparePracticeTrainingEntry).mockReset()
  vi.mocked(setQuestionSaved).mockReset()
  vi.mocked(setQuestionWeak).mockReset()
  vi.mocked(skipPracticeQuestion).mockReset()
  vi.mocked(startPracticeSession).mockReset()
  vi.mocked(submitFollowUpAnswer).mockReset()
  vi.mocked(submitPrimaryAnswer).mockReset()
})

export {
  createPracticeScenario,
  getPracticePage,
  getPracticeTaskStatus,
  retryPracticeTask,
  endPracticeFollowUps,
  endPracticeSession,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  prepareNextPracticeSession,
  preparePracticeTrainingEntry,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
}
