import type { InteractionLanguage } from "@/types/language"

export type TrainingPlanningTargetedPracticePlan = {
  action: "targetedPractice"
  reason: string
  focusAreas: string[]
  questionType:
    | "projectDeepDive"
    | "behavioral"
    | "businessUnderstanding"
    | "motivation"
    | "technicalFoundation"
  difficulty: "basic" | "pressure"
  prioritizeWeaknesses: boolean
}

export type TrainingPlanningMockInterviewPlan = {
  action: "mockInterview"
  reason: string
  focusAreas: string[]
  round: "hr" | "firstBusiness" | "technical" | "manager" | "final" | "comprehensive"
  difficulty: "basic" | "pressure"
  durationMinutes: 15 | 30 | 45
}

export type TrainingPlanningPlan =
  TrainingPlanningTargetedPracticePlan | TrainingPlanningMockInterviewPlan

export type TrainingPlanningResponse = {
  targetRoleId: string
  interactionLanguage: InteractionLanguage
  plan: TrainingPlanningPlan
}

export type EnsureCurrentTrainingPlanningInput = {
  targetRoleId: string
}

export type StartTrainingPlanningInput = {
  requestId: string
  targetRoleId: string
}
