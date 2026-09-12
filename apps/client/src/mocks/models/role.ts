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

export type MatchingAnalysisState =
  | {
      status: "blocked"
      reason:
        | "profileMissing"
        | "profileIncomplete"
        | "jobDescriptionMissing"
        | "jobDescriptionExtracting"
        | "jobDescriptionFailed"
      result?: MatchingAnalysisResult
    }
  | { status: "none" }
  | { status: "generating" }
  | { status: "current"; result: MatchingAnalysisResult }
  | { status: "stale"; result: MatchingAnalysisResult }
  | { status: "failed"; reason: string }

export type RecognizeRoleInput =
  | { sourceType: "text"; text: string }
  | { sourceType: "image"; images: File[] }
  | { sourceType: "url"; url: string }
