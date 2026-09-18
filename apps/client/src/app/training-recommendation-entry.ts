import type { InterviewEntrySearch, PracticeEntrySearch } from "@/app/training-entry-search"
import { toPracticeDifficulty, tryToPracticeQuestionType } from "@/models/training-entry"
import type { TrainingRecordRecommendation } from "@/models/training-records"

export type TrainingRecommendationEntry =
  | {
      action: "retryQuestion" | "targetedPractice"
      search: PracticeEntrySearch
      to: "/practice"
    }
  | {
      action: "mockInterview"
      search: InterviewEntrySearch
      to: "/interview"
    }

export function mapTrainingRecommendationToEntry(
  recommendation: TrainingRecordRecommendation | null,
  roleId: string,
): TrainingRecommendationEntry | null {
  if (!recommendation || recommendation.action === "none") return null

  if (recommendation.action === "mockInterview") {
    return {
      action: recommendation.action,
      search: {
        entry: "history",
        roleId,
        interviewType: recommendation.interviewType,
        difficulty: recommendation.difficulty,
      },
      to: "/interview",
    }
  }

  const questionType = tryToPracticeQuestionType(recommendation.questionType)
  return {
    action: recommendation.action,
    search: {
      entry: "history",
      roleId,
      ...(questionType ? { questionType } : {}),
      difficulty: toPracticeDifficulty(recommendation.difficulty),
    },
    to: "/practice",
  }
}
