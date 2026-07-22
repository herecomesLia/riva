import { env } from "@/app/env"
import * as practiceMockService from "@/mocks/services/practice"
import type {
  GetQuestionGenerationStatusInput,
  GetPracticeEvaluationStatusInput,
  EndPracticeFollowUpsInput,
  PracticePageResponse,
  PrepareNextPracticeSessionInput,
  PrepareNextPracticeSessionResult,
  RequestAnswerFrameworkInput,
  RequestEndPracticeSessionInput,
  RequestPracticeHintInput,
  RequestPracticeReferenceAnswerInput,
  RetryPracticeEvaluationInput,
  RetryCurrentPracticeQuestionInput,
  ContinueToNextPracticeQuestionInput,
  EndPracticeSessionInput,
  SetPracticeQuestionSavedInput,
  SetPracticeQuestionWeakInput,
  SkipPracticeQuestionInput,
  StartPracticeSessionInput,
  SubmitFollowUpAnswerInput,
  SubmitPrimaryAnswerInput,
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

export function prepareNextPracticeSession(
  input: PrepareNextPracticeSessionInput,
): Promise<PrepareNextPracticeSessionResult> {
  return env.mock ? practiceMockService.prepareNextPracticeSession(input) : realApiUnavailable()
}

export function getQuestionGenerationStatus(
  input: GetQuestionGenerationStatusInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.getQuestionGenerationStatus(input) : realApiUnavailable()
}

export function getPracticeEvaluationStatus(
  input: GetPracticeEvaluationStatusInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.getPracticeEvaluationStatus(input) : realApiUnavailable()
}

export function retryPracticeEvaluation(
  input: RetryPracticeEvaluationInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.retryPracticeEvaluation(input) : realApiUnavailable()
}

export function retryCurrentPracticeQuestion(
  input: RetryCurrentPracticeQuestionInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.retryCurrentPracticeQuestion(input) : realApiUnavailable()
}

export function continueToNextPracticeQuestion(
  input: ContinueToNextPracticeQuestionInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.continueToNextPracticeQuestion(input) : realApiUnavailable()
}

export function endPracticeSession(input: EndPracticeSessionInput): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.endPracticeSession(input) : realApiUnavailable()
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

export function requestPracticeReferenceAnswer(
  input: RequestPracticeReferenceAnswerInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.requestPracticeReferenceAnswer(input) : realApiUnavailable()
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

export function submitPrimaryAnswer(
  input: SubmitPrimaryAnswerInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.submitPrimaryAnswer(input) : realApiUnavailable()
}

export function submitFollowUpAnswer(
  input: SubmitFollowUpAnswerInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.submitFollowUpAnswer(input) : realApiUnavailable()
}

export function endPracticeFollowUps(
  input: EndPracticeFollowUpsInput,
): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.endPracticeFollowUps(input) : realApiUnavailable()
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
