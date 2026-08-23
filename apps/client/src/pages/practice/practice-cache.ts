import type {
  ActivePracticeSelection,
  EndPracticeFollowUpsInput,
  EndPracticeSessionInput,
  PracticeFollowUpMutationInput,
  PracticePageResponse,
  PracticeQuestionFlagMutationInput,
  PracticeQuestionMutationInput,
  PracticeServiceResponse,
  PrepareNextPracticeSessionInput,
  StartPracticeSessionInput,
  SubmitFollowUpAnswerInput,
  SubmitPrimaryAnswerInput,
} from "@/models/practice"

type PracticeMutationInputByKind = {
  continueToNextQuestion: PracticeQuestionMutationInput
  endFollowUps: EndPracticeFollowUpsInput
  endQuestionSession: PracticeQuestionMutationInput
  endReviewSession: EndPracticeSessionInput
  followUpFrameworkReveal: PracticeFollowUpMutationInput
  followUpHintReveal: PracticeFollowUpMutationInput
  followUpReferenceAnswerRequest: PracticeFollowUpMutationInput
  prepareNextSession: PrepareNextPracticeSessionInput
  questionFrameworkReveal: PracticeQuestionMutationInput
  questionHintReveal: PracticeQuestionMutationInput
  questionReferenceAnswerRequest: PracticeQuestionMutationInput
  questionFlagUpdate: PracticeQuestionFlagMutationInput
  retryCurrentQuestion: PracticeQuestionMutationInput
  skipQuestion: PracticeQuestionMutationInput
  startSession: StartPracticeSessionInput
  submitFollowUpAnswer: SubmitFollowUpAnswerInput
  submitPrimaryAnswer: SubmitPrimaryAnswerInput
}

export type PracticeMutationKind = keyof PracticeMutationInputByKind
export type PracticeMutationInputFor<TKind extends PracticeMutationKind> =
  PracticeMutationInputByKind[TKind]

/**
 * A synchronous mutation response is authoritative. The cache only adds the
 * returned session to the existing setup context when the API returns a
 * session rather than a complete page snapshot.
 */
export function synchronizePracticeMutationResponse<TKind extends PracticeMutationKind>(
  current: PracticePageResponse | undefined,
  response: PracticeServiceResponse,
  _mutation: {
    kind: TKind
    input: PracticeMutationInputFor<TKind>
  },
): PracticePageResponse | undefined {
  if (isPracticePageResponse(response)) return response
  if (!current) return current
  return { ...current, session: response }
}

export function getPracticeResponseSession(response: PracticeServiceResponse) {
  return isPracticePageResponse(response) ? response.session : response
}

function isPracticePageResponse(
  response: PracticeServiceResponse,
): response is PracticePageResponse {
  return "setupContext" in response
}
