import {
  getListPracticesMockHandler,
  getCreatePracticeMockHandler,
  getGetActivePracticeMockHandler,
  getGetPracticeMockHandler,
  getDeletePracticeMockHandler,
  getGetPracticeRoundMockHandler,
  getSubmitPracticeAnswerMockHandler,
  getSkipPracticeRoundMockHandler,
  getFinishPracticeRoundMockHandler,
  getRestartPracticeRoundMockHandler,
  getStartNextPracticeRoundMockHandler,
  getEndPracticeSessionMockHandler,
  getGetPracticeTaskStateMockHandler,
  getRetryPracticeTaskMockHandler,
} from "@/api/generated/endpoints/practices/practices.msw"
import type { CreatePracticeRequest, SubmitPracticeAnswerRequest } from "@/api/generated/models"
import { practicesFaker as baseFaker } from "@/mocks/fakers/practices"
import { asMswFaker } from "@/mocks/handlers/adapter"

const practicesFaker = asMswFaker(baseFaker, {
  "resource.not_found": 404,
  "resource.conflict": 409,
  "domain.validation_failed": 422,
  "request.validation_failed": 422,
})

export const practiceHandlers = [
  getListPracticesMockHandler(() => practicesFaker.listPractices()),
  getCreatePracticeMockHandler(async ({ request }) =>
    practicesFaker.createPractice((await request.json()) as CreatePracticeRequest),
  ),
  getGetActivePracticeMockHandler(() => practicesFaker.getActivePractice()),
  getGetPracticeMockHandler(({ params }) =>
    practicesFaker.getPractice(params.practiceId as string),
  ),
  getDeletePracticeMockHandler(({ params }) =>
    practicesFaker.deletePractice(params.practiceId as string),
  ),
  getGetPracticeRoundMockHandler(({ params }) =>
    practicesFaker.getPracticeRound(params.practiceId as string, params.roundId as string),
  ),
  getSubmitPracticeAnswerMockHandler(async ({ params, request }) =>
    practicesFaker.submitPracticeAnswer(
      params.practiceId as string,
      params.roundId as string,
      (await request.json()) as SubmitPracticeAnswerRequest,
    ),
  ),
  getSkipPracticeRoundMockHandler(({ params }) =>
    practicesFaker.skipPracticeRound(params.practiceId as string, params.roundId as string),
  ),
  getFinishPracticeRoundMockHandler(({ params }) =>
    practicesFaker.finishPracticeRound(params.practiceId as string, params.roundId as string),
  ),
  getRestartPracticeRoundMockHandler(({ params }) =>
    practicesFaker.restartPracticeRound(params.practiceId as string, params.roundId as string),
  ),
  getStartNextPracticeRoundMockHandler(({ params }) =>
    practicesFaker.startNextPracticeRound(params.practiceId as string, params.roundId as string),
  ),
  getEndPracticeSessionMockHandler(({ params }) =>
    practicesFaker.endPracticeSession(params.practiceId as string, params.roundId as string),
  ),
  getGetPracticeTaskStateMockHandler(({ params }) =>
    practicesFaker.getPracticeTaskState(params.practiceId as string, params.roundId as string),
  ),
  getRetryPracticeTaskMockHandler(({ params }) =>
    practicesFaker.retryPracticeTask(params.practiceId as string, params.roundId as string),
  ),
]
