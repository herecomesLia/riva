import { env } from "@/app/env"
import * as interviewMockService from "@/mocks/services/interview"
import type {
  BeginInterviewQuestionsInput,
  EndInterviewInput,
  FinishInterviewInput,
  GetInterviewReviewInput,
  GetInterviewReviewResponse,
  InterviewMutationResponse,
  InterviewPageResponse,
  StartInterviewInput,
  SubmitCandidateQuestionInput,
  SubmitInterviewAnswerInput,
} from "@/models/interview"
import type {
  InterviewTrainingEntryParameters,
  InterviewTrainingEntryPreparationResponse,
} from "@/models/training-entry"
import { interviewPageResponseSchema } from "@/schemas/interview"
import { apiRequest } from "@/services/api"

function realApiUnavailable(): never {
  throw new Error("Real interview API is not implemented.")
}

async function requestInterviewPage(
  path: string,
  options?: Parameters<typeof apiRequest>[1],
): Promise<InterviewMutationResponse> {
  return interviewPageResponseSchema.parse(
    await apiRequest<unknown>(path, options),
  ) as InterviewMutationResponse
}

export function getInterviewPage(): Promise<InterviewPageResponse> {
  if (env.mock) return interviewMockService.getInterviewPage()
  return requestInterviewPage("/interview")
}

export function startInterview(input: StartInterviewInput): Promise<InterviewMutationResponse> {
  if (env.mock) return interviewMockService.startInterview(input)
  return requestInterviewPage("/interview/sessions", { json: input, method: "POST" })
}

export function prepareInterviewTrainingEntry(
  input: InterviewTrainingEntryParameters,
): Promise<InterviewTrainingEntryPreparationResponse> {
  return env.mock ? interviewMockService.prepareInterviewTrainingEntry(input) : realApiUnavailable()
}

export function beginInterviewQuestions(
  input: BeginInterviewQuestionsInput,
): Promise<InterviewMutationResponse> {
  if (env.mock) return interviewMockService.beginInterviewQuestions(input)
  return requestInterviewPage(
    `/interview/sessions/${encodeURIComponent(input.sessionId)}/questions/begin`,
    { json: { version: input.version }, method: "POST" },
  )
}

export function submitInterviewAnswer(
  input: SubmitInterviewAnswerInput,
): Promise<InterviewMutationResponse> {
  if (env.mock) return interviewMockService.submitInterviewAnswer(input)
  throw new Error("Real interview answer API is not implemented.")
}

export function submitCandidateQuestion(
  input: SubmitCandidateQuestionInput,
): Promise<InterviewMutationResponse> {
  if (env.mock) return interviewMockService.submitCandidateQuestion(input)
  throw new Error("Real interview candidate-question API is not implemented.")
}

export function finishInterview(input: FinishInterviewInput): Promise<InterviewMutationResponse> {
  if (env.mock) return interviewMockService.finishInterview(input)
  throw new Error("Real interview finish API is not implemented.")
}

export function endInterview(input: EndInterviewInput): Promise<InterviewMutationResponse> {
  if (env.mock) return interviewMockService.endInterview(input)
  throw new Error("Real interview end API is not implemented.")
}

export function getInterviewReview(
  input: GetInterviewReviewInput,
): Promise<GetInterviewReviewResponse> {
  if (env.mock) return interviewMockService.getInterviewReview(input)
  throw new Error("Real interview review API is not implemented.")
}
