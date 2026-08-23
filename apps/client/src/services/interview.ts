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
import {
  resolveInterviewTrainingEntry,
  resolveTrainingEntryRoleAvailability,
} from "@/models/training-entry"
import type { RolesPageResponse } from "@/models/roles"
import { getRolesPage } from "@/services/roles"
import { getInterviewReviewResponseSchema, interviewPageResponseSchema } from "@/schemas/interview"
import { apiRequest } from "@/services/api"

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
  if (env.mock) return interviewMockService.prepareInterviewTrainingEntry(input)
  return prepareRealInterviewTrainingEntry(input)
}

async function prepareRealInterviewTrainingEntry(
  input: InterviewTrainingEntryParameters,
): Promise<InterviewTrainingEntryPreparationResponse> {
  const [rolesResponse, interviewPage] = await Promise.all([getRolesPage(), getInterviewPage()])
  if (interviewPage.session !== null && interviewPage.session.status !== "completed") {
    throw new Error("Cannot prepare a history entry while an interview session is active.")
  }

  const setup = interviewPage.setup
  const roleAvailability = resolveTrainingEntryRoleAvailability(
    rolesResponse.roles,
    getTrainableInterviewRoleIds(rolesResponse, setup),
    input.targetRoleId,
    setup.availability.status === "available" && rolesResponse.profileContext.completed,
  )
  const resolution = resolveInterviewTrainingEntry(setup, input, roleAvailability)

  return {
    page: { setup, session: null },
    resolution,
  }
}

function getTrainableInterviewRoleIds(
  rolesResponse: RolesPageResponse,
  setup: InterviewPageResponse["setup"],
): string[] {
  if (setup.availability.status !== "available" || !rolesResponse.profileContext.completed) {
    return []
  }
  const setupRoleIds = new Set(setup.targetRoles.map((role) => role.id))
  return rolesResponse.roles
    .filter(
      (role) =>
        setupRoleIds.has(role.id) &&
        role.preparationStatus !== "archived" &&
        role.jobDescription.status === "ready" &&
        role.jobDescriptionAnalysis !== null,
    )
    .map((role) => role.id)
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
  return requestInterviewPage(
    `/interview/sessions/${encodeURIComponent(input.sessionId)}/answers`,
    {
      json:
        input.target === "question"
          ? {
              version: input.version,
              target: input.target,
              questionId: input.questionId,
              content: input.content,
            }
          : {
              version: input.version,
              target: input.target,
              questionId: input.questionId,
              followUpQuestionId: input.followUpQuestionId,
              content: input.content,
            },
      method: "POST",
    },
  )
}

export function submitCandidateQuestion(
  input: SubmitCandidateQuestionInput,
): Promise<InterviewMutationResponse> {
  if (env.mock) return interviewMockService.submitCandidateQuestion(input)
  return requestInterviewPage(
    `/interview/sessions/${encodeURIComponent(input.sessionId)}/candidate-questions`,
    {
      json: { version: input.version, content: input.content },
      method: "POST",
    },
  )
}

export function finishInterview(input: FinishInterviewInput): Promise<InterviewMutationResponse> {
  if (env.mock) return interviewMockService.finishInterview(input)
  return requestInterviewPage(`/interview/sessions/${encodeURIComponent(input.sessionId)}/finish`, {
    json: { version: input.version },
    method: "POST",
  })
}

export function endInterview(input: EndInterviewInput): Promise<InterviewMutationResponse> {
  if (env.mock) return interviewMockService.endInterview(input)
  return requestInterviewPage(`/interview/sessions/${encodeURIComponent(input.sessionId)}/end`, {
    json: { version: input.version },
    method: "POST",
  })
}

export async function getInterviewReview(
  input: GetInterviewReviewInput,
): Promise<GetInterviewReviewResponse> {
  if (env.mock) return interviewMockService.getInterviewReview(input)
  return getInterviewReviewResponseSchema.parse(
    await apiRequest<unknown>(`/interview/sessions/${encodeURIComponent(input.sessionId)}/review`),
  ) as GetInterviewReviewResponse
}
