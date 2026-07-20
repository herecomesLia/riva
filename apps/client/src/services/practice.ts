import { env } from "@/app/env"
import * as practiceMockService from "@/mocks/services/practice"
import type {
  GetQuestionGenerationStatusInput,
  PracticePageResponse,
  StartPracticeSessionInput,
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
