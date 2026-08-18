import type { InterviewEntrySearch, PracticeEntrySearch } from "@/app/training-entry-search"
import type {
  TrainingPlanningMockInterviewPlan,
  TrainingPlanningPlan,
  TrainingPlanningTargetedPracticePlan,
} from "@/models/training-planning"

export type TrainingPlanningEntry =
  | {
      action: "targetedPractice"
      to: "/practice"
      search: PracticeEntrySearch
    }
  | {
      action: "mockInterview"
      to: "/interview"
      search: InterviewEntrySearch
    }

export function mapTrainingPlanToEntry(
  plan: TrainingPlanningPlan,
  targetRoleId: string,
): TrainingPlanningEntry {
  if (plan.action === "targetedPractice") {
    return mapTargetedPracticePlanToEntry(plan, targetRoleId)
  }
  return mapMockInterviewPlanToEntry(plan, targetRoleId)
}

function mapTargetedPracticePlanToEntry(
  plan: TrainingPlanningTargetedPracticePlan,
  targetRoleId: string,
): Extract<TrainingPlanningEntry, { action: "targetedPractice" }> {
  return {
    action: "targetedPractice",
    to: "/practice",
    search: {
      entry: "planner",
      targetRoleId,
      questionType: plan.questionType,
      difficulty: plan.difficulty,
      source: "personalized",
      prioritizeWeaknesses: plan.prioritizeWeaknesses,
    },
  }
}

function mapMockInterviewPlanToEntry(
  plan: TrainingPlanningMockInterviewPlan,
  targetRoleId: string,
): Extract<TrainingPlanningEntry, { action: "mockInterview" }> {
  return {
    action: "mockInterview",
    to: "/interview",
    search: {
      entry: "planner",
      targetRoleId,
      round: plan.round,
      difficulty: plan.difficulty,
      durationMinutes: plan.durationMinutes,
    },
  }
}
