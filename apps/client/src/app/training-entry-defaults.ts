import type { InterviewSetupViewData } from "@/models/interview"
import type { PracticePageResponse } from "@/models/practice"
import {
  resolveInterviewTrainingEntry,
  resolvePracticeTrainingEntry,
} from "@/models/training-entry"

import type { InterviewEntrySearch, PracticeEntrySearch } from "./training-entry-search"

export function applyPracticeEntrySearch(
  response: PracticePageResponse,
  search: PracticeEntrySearch,
): PracticePageResponse {
  if (response.session.status !== "setup") return response

  return {
    ...response,
    session: {
      ...response.session,
      selection: resolvePracticeTrainingEntry(
        response.setupContext,
        response.session.selection,
        search,
      ),
    },
  }
}

export function applyInterviewEntrySearch(
  setup: InterviewSetupViewData,
  search: InterviewEntrySearch,
): InterviewSetupViewData {
  return {
    ...setup,
    defaultConfiguration: resolveInterviewTrainingEntry(setup, search),
  }
}
