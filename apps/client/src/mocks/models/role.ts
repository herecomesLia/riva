export type MatchingAnalysisResult = {
  overallMatchScore: number
  coreRequirements: string
  /** Summarized from reasons of matching items with scores > 80. */
  resumeStrengths: string[]
  /** Summarized from reasons of matching items with scores < 60. */
  resumeGaps: string[]
  resumeOptimizationSuggestions: string[]
  interviewPreparationSuggestions: string[]
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
