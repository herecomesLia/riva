export type TargetRoleRecruitmentType = "campus" | "experienced"

export type TargetRolePreparationStatus = "preparing" | "paused" | "archived"

export type TargetRoleExperienceRange = {
  minYears: number | null
  maxYears: number | null
}

export type JobDescriptionParsingStatus = "missing" | "parsing" | "ready" | "failed"

export type JobDescription = {
  rawText: string | null
  /** Increments only when the saved JD text changes. */
  version: number | null
  status: JobDescriptionParsingStatus
  parsingFailureReason: string | null
}

export type JobDescriptionAnalysis = {
  /** The JD version this structured result was parsed from. */
  jobDescriptionVersion: number
  responsibilities: string[]
  requiredSkills: string[]
  preferredSkills: string[]
  experienceRequirements: string[]
  softSkills: string[]
  businessDomains: string[]
  frequentKeywords: string[]
  coreRequirementsSummary: string
}

export type MatchingAnalysisStatus = "generating" | "current" | "stale" | "failed"

export type MatchingAnalysisResult = {
  coreRequirementsSummary: string
  matchedCapabilities: string[]
  missingCapabilities: string[]
  underrepresentedCapabilities: string[]
  resumeHighlights: string[]
  resumeGaps: string[]
  preparationRecommendations: string[]
}

type MatchingAnalysisVersionContext = {
  /** The target role revision used to generate this result. */
  roleVersion: number
  /** The profile revision used to generate this result. */
  profileVersion: number
  /** The JD revision used to generate this result. */
  jobDescriptionVersion: number
}

export type GeneratingMatchingAnalysis = MatchingAnalysisVersionContext & {
  status: "generating"
  generatedAt: null
  failureReason: null
  result: null
}

export type CurrentMatchingAnalysis = MatchingAnalysisVersionContext & {
  status: "current"
  generatedAt: string
  failureReason: null
  result: MatchingAnalysisResult
}

export type StaleMatchingAnalysis = MatchingAnalysisVersionContext & {
  status: "stale"
  generatedAt: string
  failureReason: null
  result: MatchingAnalysisResult
}

export type FailedMatchingAnalysis = MatchingAnalysisVersionContext & {
  status: "failed"
  generatedAt: null
  failureReason: string
  result: null
}

export type MatchingAnalysis =
  | GeneratingMatchingAnalysis
  | CurrentMatchingAnalysis
  | StaleMatchingAnalysis
  | FailedMatchingAnalysis

export type TargetRole = {
  id: string
  title: string
  company: string | null
  recruitmentType: TargetRoleRecruitmentType | null
  location: string | null
  experienceRange: TargetRoleExperienceRange | null
  /** Whether the user is actively preparing for this saved role. */
  preparationStatus: TargetRolePreparationStatus
  /** Whether this role is the default context for Dashboard and training. */
  isCurrent: boolean
  createdAt: string
  updatedAt: string
  /** Increments for every persisted target-role mutation. */
  version: number
  jobDescription: JobDescription
  /** Present only when the current JD version has been parsed successfully. */
  jobDescriptionAnalysis: JobDescriptionAnalysis | null
  /** Absent until a matching analysis has been requested. */
  matchingAnalysis: MatchingAnalysis | null
}

export type RolesPageResponse = {
  roles: TargetRole[]
  /** Must identify the single role where `isCurrent` is true, when one exists. */
  currentRoleId: string | null
  profileContext: {
    exists: boolean
    version: number | null
    completed: boolean
  }
}

export type CreateTargetRoleInput = {
  title: string
  company: string | null
  recruitmentType: TargetRoleRecruitmentType | null
  location: string | null
  experienceRange: TargetRoleExperienceRange | null
  preparationStatus: TargetRolePreparationStatus
}

export type UpdateTargetRoleInput = {
  roleId: string
  version: number
  title: string
  company: string | null
  recruitmentType: TargetRoleRecruitmentType | null
  location: string | null
  experienceRange: TargetRoleExperienceRange | null
}

export type SetCurrentTargetRoleInput = {
  roleId: string
  version: number
}

export type UpdateTargetRolePreparationStatusInput = {
  roleId: string
  version: number
  preparationStatus: TargetRolePreparationStatus
}

export type ArchiveTargetRoleInput = {
  roleId: string
  version: number
}

export type DeleteTargetRoleInput = {
  roleId: string
  version: number
}

export type SaveTargetRoleJobDescriptionInput = {
  roleId: string
  version: number
  rawText: string
}

export type StartOrRetryJobDescriptionParsingInput = {
  roleId: string
  version: number
  jobDescriptionVersion: number
}

export type GenerateOrRegenerateMatchingAnalysisInput = {
  roleId: string
  version: number
  profileVersion: number
  jobDescriptionVersion: number
}
