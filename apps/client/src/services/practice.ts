import { env } from "@/app/env"
import * as practiceMockService from "@/mocks/services/practice"
import type {
  GetQuestionGenerationStatusInput,
  PracticePageResponse,
  RequestAnswerFrameworkInput,
  RequestEndPracticeSessionInput,
  RequestPracticeHintInput,
  SetPracticeQuestionSavedInput,
  SetPracticeQuestionWeakInput,
  SkipPracticeQuestionInput,
  StartPracticeSessionInput,
  SubmitPracticeAnswerInput,
} from "@/models/practice"

function realApiUnavailable(): never {
  throw new Error("Real practice API is not implemented.")
}

export function getPracticePage(): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.getPracticePage() : realApiUnavailable()
}

export function startPracticeSession(
  input: StartPracticeSessionInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.startPracticeSession(input) : realApiUnavailable()
}

export function getQuestionGenerationStatus(
  input: GetQuestionGenerationStatusInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.getQuestionGenerationStatus(input) : realApiUnavailable()
}

export function requestPracticeHint(
  input: RequestPracticeHintInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.requestPracticeHint(input) : realApiUnavailable()
}

export function requestAnswerFramework(
  input: RequestAnswerFrameworkInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.requestAnswerFramework(input) : realApiUnavailable()
}

export function setQuestionSaved(
  input: SetPracticeQuestionSavedInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.setQuestionSaved(input) : realApiUnavailable()
}

export function setQuestionWeak(
  input: SetPracticeQuestionWeakInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.setQuestionWeak(input) : realApiUnavailable()
}

export function submitPracticeAnswer(
  input: SubmitPracticeAnswerInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.submitPracticeAnswer(input) : realApiUnavailable()
}

export function skipPracticeQuestion(
  input: SkipPracticeQuestionInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.skipPracticeQuestion(input) : realApiUnavailable()
}

export function requestEndPracticeSession(
  input: RequestEndPracticeSessionInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.requestEndPracticeSession(input) : realApiUnavailable()
}
