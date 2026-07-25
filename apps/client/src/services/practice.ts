import { env } from "@/app/env"
import * as practiceMockService from "@/mocks/services/practice"
import type {
  GetQuestionGenerationStatusInput,
  GetPracticeEvaluationStatusInput,
  EndPracticeFollowUpsInput,
  PracticeMutationResponse,
  PracticePageResponse,
  PrepareNextPracticeSessionInput,
  RequestAnswerFrameworkInput,
  RequestEndPracticeSessionInput,
  RequestPracticeHintInput,
  RequestPracticeReferenceAnswerInput,
  RequestPracticeFollowUpFrameworkInput,
  RequestPracticeFollowUpHintInput,
  RequestPracticeFollowUpReferenceAnswerInput,
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
import type { PracticeTrainingEntryParameters } from "@/models/training-entry"

function realApiUnavailable(): never {
  throw new Error("Real practice API is not implemented.")
}

export function getPracticePage(): Promise<PracticePageResponse> {
  return env.mock ? practiceMockService.getPracticePage() : realApiUnavailable()
}

export function startPracticeSession(
  input: StartPracticeSessionInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.startPracticeSession(input) : realApiUnavailable()
}

export function prepareNextPracticeSession(
  input: PrepareNextPracticeSessionInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.prepareNextPracticeSession(input) : realApiUnavailable()
}

export function preparePracticeTrainingEntry(
  input: PracticeTrainingEntryParameters,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.preparePracticeTrainingEntry(input) : realApiUnavailable()
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
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.retryPracticeEvaluation(input) : realApiUnavailable()
}

export function retryCurrentPracticeQuestion(
  input: RetryCurrentPracticeQuestionInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.retryCurrentPracticeQuestion(input) : realApiUnavailable()
}

export function continueToNextPracticeQuestion(
  input: ContinueToNextPracticeQuestionInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.continueToNextPracticeQuestion(input) : realApiUnavailable()
}

export function endPracticeSession(
  input: EndPracticeSessionInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.endPracticeSession(input) : realApiUnavailable()
}

export function requestPracticeHint(
  input: RequestPracticeHintInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.requestPracticeHint(input) : realApiUnavailable()
}

export function requestAnswerFramework(
  input: RequestAnswerFrameworkInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.requestAnswerFramework(input) : realApiUnavailable()
}

export function requestPracticeReferenceAnswer(
  input: RequestPracticeReferenceAnswerInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.requestPracticeReferenceAnswer(input) : realApiUnavailable()
}

export function requestPracticeFollowUpHint(
  input: RequestPracticeFollowUpHintInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.requestPracticeFollowUpHint(input) : realApiUnavailable()
}

export function requestPracticeFollowUpFramework(
  input: RequestPracticeFollowUpFrameworkInput,
): Promise<PracticeMutationResponse> {
  return env.mock
    ? practiceMockService.requestPracticeFollowUpFramework(input)
    : realApiUnavailable()
}

export function requestPracticeFollowUpReferenceAnswer(
  input: RequestPracticeFollowUpReferenceAnswerInput,
): Promise<PracticeMutationResponse> {
  return env.mock
    ? practiceMockService.requestPracticeFollowUpReferenceAnswer(input)
    : realApiUnavailable()
}

export function setQuestionSaved(
  input: SetPracticeQuestionSavedInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.setQuestionSaved(input) : realApiUnavailable()
}

export function setQuestionWeak(
  input: SetPracticeQuestionWeakInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.setQuestionWeak(input) : realApiUnavailable()
}

export function submitPrimaryAnswer(
  input: SubmitPrimaryAnswerInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.submitPrimaryAnswer(input) : realApiUnavailable()
}

export function submitFollowUpAnswer(
  input: SubmitFollowUpAnswerInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.submitFollowUpAnswer(input) : realApiUnavailable()
}

export function endPracticeFollowUps(
  input: EndPracticeFollowUpsInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.endPracticeFollowUps(input) : realApiUnavailable()
}

export function skipPracticeQuestion(
  input: SkipPracticeQuestionInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.skipPracticeQuestion(input) : realApiUnavailable()
}

export function requestEndPracticeSession(
  input: RequestEndPracticeSessionInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.requestEndPracticeSession(input) : realApiUnavailable()
}
