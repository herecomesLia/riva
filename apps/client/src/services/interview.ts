import { env } from "@/app/env"
import * as interviewMockService from "@/mocks/services/interview"
import type {
  BeginInterviewQuestionsInput,
  EndInterviewInput,
  FinishInterviewInput,
  GetInterviewReviewInput,
  GetInterviewReviewResponse,
  InterviewCompletionResponse,
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

function realApiUnavailable(): never {
  throw new Error("Real interview API is not implemented.")
}

export function getInterviewPage(): Promise<InterviewPageResponse> {
  return env.mock ? interviewMockService.getInterviewPage() : realApiUnavailable()
}

export function startInterview(input: StartInterviewInput): Promise<InterviewMutationResponse> {
  return env.mock ? interviewMockService.startInterview(input) : realApiUnavailable()
}

export function prepareInterviewTrainingEntry(
  input: InterviewTrainingEntryParameters,
): Promise<InterviewTrainingEntryPreparationResponse> {
  return env.mock ? interviewMockService.prepareInterviewTrainingEntry(input) : realApiUnavailable()
}

export function beginInterviewQuestions(
  input: BeginInterviewQuestionsInput,
): Promise<InterviewMutationResponse> {
  return env.mock ? interviewMockService.beginInterviewQuestions(input) : realApiUnavailable()
}

export function submitInterviewAnswer(
  input: SubmitInterviewAnswerInput,
): Promise<InterviewMutationResponse> {
  return env.mock ? interviewMockService.submitInterviewAnswer(input) : realApiUnavailable()
}

export function submitCandidateQuestion(
  input: SubmitCandidateQuestionInput,
): Promise<InterviewMutationResponse> {
  return env.mock ? interviewMockService.submitCandidateQuestion(input) : realApiUnavailable()
}

export function finishInterview(input: FinishInterviewInput): Promise<InterviewCompletionResponse> {
  return env.mock ? interviewMockService.finishInterview(input) : realApiUnavailable()
}

export function endInterview(input: EndInterviewInput): Promise<InterviewCompletionResponse> {
  return env.mock ? interviewMockService.endInterview(input) : realApiUnavailable()
}

export function getInterviewReview(
  input: GetInterviewReviewInput,
): Promise<GetInterviewReviewResponse> {
  return env.mock ? interviewMockService.getInterviewReview(input) : realApiUnavailable()
}
