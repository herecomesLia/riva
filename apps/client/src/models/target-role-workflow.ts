import type { JobDescriptionResponse, TargetRoleResponse } from "@/api/generated/models"

export type MatchingAnalysisResult = {
  overallMatchScore: number
  coreRequirementsSummary: string
  matchedCapabilities: string[]
  missingCapabilities: string[]
  underrepresentedCapabilities: string[]
  resumeHighlights: string[]
  resumeGaps: string[]
  highRiskQuestions: string[]
  preparationRecommendations: string[]
}

export type JdState =
  | { status: "missing" }
  | { status: "extracting"; phase: "queued" | "running" | "aborting" }
  | { status: "ready"; result: JobDescriptionResponse }
  | { status: "failed"; reason: string }

export type MatchState =
  | { status: "none" }
  | { status: "generating" }
  | { status: "current"; result: MatchingAnalysisResult }
  | { status: "stale"; result: MatchingAnalysisResult }
  | { status: "failed"; reason: string }

export type RoleView = TargetRoleResponse & {
  jdState: JdState
  matchState: MatchState
}

export type ProfileState = {
  exists: boolean
  complete: boolean
}

export type RolesData = {
  roles: RoleView[]
  activeRoleId: string | null
  profile: ProfileState
}

export type RecognizeRoleInput =
  | { sourceType: "text"; text: string }
  | { sourceType: "image"; images: File[] }
  | { sourceType: "url"; url: string }

export type JdField = keyof JobDescriptionResponse
