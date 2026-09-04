import type { JobDescriptionResponse } from "@/api/generated/models"
import type { MatchingAnalysisResult } from "@/models/roles"

export type JdState =
  | { status: "missing" }
  | { status: "parsing" }
  | { status: "ready"; result: JobDescriptionResponse }
  | { status: "failed"; reason: string }

export type MatchState =
  | { status: "none" }
  | { status: "generating" }
  | { status: "current"; result: MatchingAnalysisResult }
  | { status: "stale"; result: MatchingAnalysisResult }
  | { status: "failed"; reason: string }
