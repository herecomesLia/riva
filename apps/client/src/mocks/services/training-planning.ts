import { getCurrentInteractionLanguage } from "@/i18n/language"
import type {
  EnsureCurrentTrainingPlanningInput,
  StartTrainingPlanningInput,
  TrainingPlanningStatusResponse,
} from "@/models/training-planning"

const runs = new Map<string, TrainingPlanningStatusResponse>()
let sequence = 0

export async function ensureCurrentTrainingPlanning(
  input: EnsureCurrentTrainingPlanningInput,
): Promise<TrainingPlanningStatusResponse> {
  const language = getCurrentInteractionLanguage()
  const key = `${input.targetRoleId}:${language}`
  const existing = runs.get(key)
  if (existing) return structuredClone(existing)

  const response = createSucceededResponse(input.targetRoleId, language)
  runs.set(key, response)
  runs.set(response.runId, response)
  return structuredClone(response)
}

export async function startTrainingPlanning(
  input: StartTrainingPlanningInput,
): Promise<TrainingPlanningStatusResponse> {
  const response = createSucceededResponse(input.targetRoleId, getCurrentInteractionLanguage())
  runs.set(response.runId, response)
  runs.set(`request:${input.requestId}`, response)
  return structuredClone(response)
}

export async function getTrainingPlanningStatus(
  runId: string,
): Promise<TrainingPlanningStatusResponse> {
  const response = runs.get(runId)
  if (!response) throw new Error("Training planning run does not exist.")
  return structuredClone(response)
}

function createSucceededResponse(
  targetRoleId: string,
  interactionLanguage: "zh-CN" | "en",
): TrainingPlanningStatusResponse {
  sequence += 1
  const suffix = String(sequence).padStart(12, "0")
  return {
    runId: `00000000-0000-4000-8000-${suffix}`,
    status: "succeeded",
    targetRoleId,
    interactionLanguage,
    attemptCount: 1,
    maxAttempts: 3,
    errorCode: null,
    failureReason: null,
    createdAt: "2026-08-18T10:00:00.000Z",
    startedAt: "2026-08-18T10:00:00.000Z",
    finishedAt: "2026-08-18T10:00:01.000Z",
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
