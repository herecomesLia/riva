import { getCurrentInteractionLanguage } from "@/i18n/language"
import type {
  EnsureCurrentTrainingPlanningInput,
  StartTrainingPlanningInput,
  TrainingPlanningResponse,
} from "@/models/training-planning"

const responses = new Map<string, TrainingPlanningResponse>()

export async function ensureCurrentTrainingPlanning(
  input: EnsureCurrentTrainingPlanningInput,
): Promise<TrainingPlanningResponse> {
  const language = getCurrentInteractionLanguage()
  const key = `${input.targetRoleId}:${language}`
  const existing = responses.get(key)
  if (existing) return structuredClone(existing)

  const response = createSucceededResponse(input.targetRoleId, language)
  responses.set(key, response)
  return structuredClone(response)
}

export async function startTrainingPlanning(
  input: StartTrainingPlanningInput,
): Promise<TrainingPlanningResponse> {
  const response = createSucceededResponse(input.targetRoleId, getCurrentInteractionLanguage())
  responses.set(`request:${input.requestId}`, response)
  return structuredClone(response)
}

function createSucceededResponse(
  targetRoleId: string,
  interactionLanguage: "zh-CN" | "en",
): TrainingPlanningResponse {
  return {
    targetRoleId,
    interactionLanguage,
    plan: {
      action: "targetedPractice",
      reason: "练习当前岗位最需要补强的项目结果表达。",
      focusAreas: ["项目结果表达"],
      questionType: "projectDeepDive",
      difficulty: "basic",
      prioritizeWeaknesses: false,
    },
  }
}
