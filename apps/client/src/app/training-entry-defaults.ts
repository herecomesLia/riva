import type { InterviewSetupViewData } from "@/models/interview"
import type { PracticePageResponse, PracticeSetupSelection } from "@/models/practice"

import type { InterviewEntrySearch, PracticeEntrySearch } from "./training-entry-search"

export function applyPracticeEntrySearch(
  response: PracticePageResponse,
  search: PracticeEntrySearch,
): PracticePageResponse {
  if (response.session.status !== "setup") return response

  const current = response.session.selection
  const targetRoleId =
    search.targetRoleId !== undefined &&
    response.setupContext.targetRoles.some((role) => role.id === search.targetRoleId)
      ? search.targetRoleId
      : current.targetRoleId
  const selectedRole = response.setupContext.targetRoles.find((role) => role.id === targetRoleId)
  const questionType =
    search.questionType !== undefined &&
    selectedRole?.supportedQuestionTypes.includes(search.questionType)
      ? search.questionType
      : current.questionType
  const selection: PracticeSetupSelection = {
    targetRoleId,
    questionType:
      selectedRole?.supportedQuestionTypes.includes(questionType) === true
        ? questionType
        : (selectedRole?.supportedQuestionTypes[0] ?? questionType),
    difficulty: search.difficulty ?? current.difficulty,
    source: search.source ?? current.source,
    prioritizeWeaknesses: search.prioritizeWeaknesses ?? current.prioritizeWeaknesses,
  }

  return { ...response, session: { ...response.session, selection } }
}

export function applyInterviewEntrySearch(
  setup: InterviewSetupViewData,
  search: InterviewEntrySearch,
): InterviewSetupViewData {
  const current = setup.defaultConfiguration
  const targetRoleId =
    search.targetRoleId !== undefined &&
    setup.targetRoles.some((role) => role.id === search.targetRoleId)
      ? search.targetRoleId
      : current.targetRoleId
  const selectedRole = setup.targetRoles.find((role) => role.id === targetRoleId)
  const round =
    search.round !== undefined && selectedRole?.supportedRounds.includes(search.round)
      ? search.round
      : current.round

  return {
    ...setup,
    defaultConfiguration: {
      targetRoleId,
      round:
        selectedRole?.supportedRounds.includes(round) === true
          ? round
          : (selectedRole?.supportedRounds[0] ?? round),
      difficulty: setup.availableDifficulties.includes(search.difficulty ?? current.difficulty)
        ? (search.difficulty ?? current.difficulty)
        : setup.availableDifficulties[0],
      durationMinutes: setup.availableDurationMinutes.includes(
        search.durationMinutes ?? current.durationMinutes,
      )
        ? (search.durationMinutes ?? current.durationMinutes)
        : setup.availableDurationMinutes[0],
    },
  }
}
