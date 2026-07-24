import { beforeEach, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import {
  createPracticeMockResponse,
  createPracticeReferenceAnswer,
  getPracticeFollowUpPlan,
} from "@/mocks/data/practice"
import { PracticePage } from "@/pages/practice"
import {
  endPracticeFollowUps,
  getPracticePage,
  getPracticeEvaluationStatus,
  getQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
  requestPracticeFollowUpFramework,
  requestPracticeFollowUpHint,
  requestPracticeFollowUpReferenceAnswer,
  retryPracticeEvaluation,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  endPracticeSession,
  prepareNextPracticeSession,
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

export function renderPracticePage() {
  return renderWithProviders(<PracticePage />, {
    router: { initialEntries: ["/practice"] },
  })
}

beforeEach(async () => {
  await i18n.changeLanguage(defaultLanguage)
  vi.mocked(getPracticePage).mockReset()
  vi.mocked(getPracticeEvaluationStatus).mockReset()
  vi.mocked(getQuestionGenerationStatus).mockReset()
  vi.mocked(endPracticeFollowUps).mockReset()
  vi.mocked(requestAnswerFramework).mockReset()
  vi.mocked(requestEndPracticeSession).mockReset()
  vi.mocked(requestPracticeHint).mockReset()
  vi.mocked(requestPracticeReferenceAnswer).mockReset()
  vi.mocked(requestPracticeFollowUpFramework).mockReset()
  vi.mocked(requestPracticeFollowUpHint).mockReset()
  vi.mocked(requestPracticeFollowUpReferenceAnswer).mockReset()
  vi.mocked(retryPracticeEvaluation).mockReset()
  vi.mocked(retryCurrentPracticeQuestion).mockReset()
  vi.mocked(continueToNextPracticeQuestion).mockReset()
  vi.mocked(endPracticeSession).mockReset()
  vi.mocked(prepareNextPracticeSession).mockReset()
  vi.mocked(setQuestionSaved).mockReset()
  vi.mocked(setQuestionWeak).mockReset()
  vi.mocked(skipPracticeQuestion).mockReset()
  vi.mocked(startPracticeSession).mockReset()
  vi.mocked(submitFollowUpAnswer).mockReset()
  vi.mocked(submitPrimaryAnswer).mockReset()
})

export {
  createPracticeMockResponse,
  createPracticeReferenceAnswer,
  getPracticeFollowUpPlan,
  getPracticePage,
  getPracticeEvaluationStatus,
  getQuestionGenerationStatus,
  endPracticeFollowUps,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
  requestPracticeFollowUpFramework,
  requestPracticeFollowUpHint,
  requestPracticeFollowUpReferenceAnswer,
  retryPracticeEvaluation,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  endPracticeSession,
  prepareNextPracticeSession,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
}
