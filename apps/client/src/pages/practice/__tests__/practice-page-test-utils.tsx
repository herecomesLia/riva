import { beforeEach, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import {
  createPracticeMockResponse,
  createPracticeReferenceAnswer,
  getMockQuestionTemplateId,
  getPracticeFollowUpPlan,
} from "@/mocks/data/practice"
import { PracticePage } from "@/pages/practice"
import {
  endPracticeFollowUps,
  getPracticePage,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
  requestPracticeFollowUpFramework,
  requestPracticeFollowUpHint,
  requestPracticeFollowUpReferenceAnswer,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  endPracticeSession,
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
  vi.mocked(endPracticeFollowUps).mockReset()
  vi.mocked(requestAnswerFramework).mockReset()
  vi.mocked(requestEndPracticeSession).mockReset()
  vi.mocked(requestPracticeHint).mockReset()
  vi.mocked(requestPracticeReferenceAnswer).mockReset()
  vi.mocked(requestPracticeFollowUpFramework).mockReset()
  vi.mocked(requestPracticeFollowUpHint).mockReset()
  vi.mocked(requestPracticeFollowUpReferenceAnswer).mockReset()
  vi.mocked(retryCurrentPracticeQuestion).mockReset()
  vi.mocked(continueToNextPracticeQuestion).mockReset()
  vi.mocked(endPracticeSession).mockReset()
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
  createPracticeMockResponse,
  createPracticeReferenceAnswer,
  getMockQuestionTemplateId,
  getPracticeFollowUpPlan,
  getPracticePage,
  endPracticeFollowUps,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
  requestPracticeFollowUpFramework,
  requestPracticeFollowUpHint,
  requestPracticeFollowUpReferenceAnswer,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  endPracticeSession,
  prepareNextPracticeSession,
  preparePracticeTrainingEntry,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
}
