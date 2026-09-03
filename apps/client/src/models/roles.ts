export type TargetRoleRecruitmentType = "campus" | "experienced"

export type TargetRoleStatus = "active" | "archived"

export type JobDescriptionParsingStatus = "missing" | "parsing" | "ready" | "failed"

export type MissingJobDescription = {
  status: "missing"
  version: null
  parsingFailureReason: null
}

export type ParsingJobDescription = {
  status: "parsing"
  /** Increments only when the saved JD text changes. */
  version: number
  parsingFailureReason: null
}

export type ReadyJobDescription = {
  status: "ready"
  /** Increments only when the saved JD text changes. */
  version: number
  parsingFailureReason: null
}

export type FailedJobDescription = {
  status: "failed"
  /** Increments only when the saved JD text changes. */
  version: number
  parsingFailureReason: string
}

export type JobDescription =
  MissingJobDescription | ParsingJobDescription | ReadyJobDescription | FailedJobDescription

export type QualificationRequirements = {
  education: string[]
  graduationCohorts: string[]
  majors: string[]
  experience: string[]
  languages: string[]
  certifications: string[]
  other: string[]
}

export type RequiredSkillGroups = {
  programmingLanguages: string[]
  frameworksAndLibraries: string[]
  platforms: string[]
  tools: string[]
  conceptsAndMethods: string[]
  databasesAndMiddleware: string[]
  other: string[]
}

export type JobDescriptionAnalysis = {
  /** The JD version this structured result was parsed from. */
  jobDescriptionVersion: number
  /** Increments when the user corrects a structured JD module. */
  analysisVersion: number
  /** When structured JD parsing completed. */
  parsedAt: string
  responsibilities: string[]
  qualificationRequirements: QualificationRequirements
  requiredSkills: RequiredSkillGroups
  preferredQualifications: string[]
  softSkills: string[]
  businessDomains: string[]
}

export type MatchingAnalysisStatus = "generating" | "current" | "stale" | "failed"

export type MatchingAnalysisResult = {
  /** Whole-number percentage from 0 to 100. */
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

type MatchingAnalysisVersionContext = {
  /** The profile revision used to generate this result. */
  profileVersion: number
  /** The JD revision used to generate this result. */
  jobDescriptionVersion: number
  /** The structured JD analysis revision used to generate this result. */
  jobDescriptionAnalysisVersion: number
}

export type GeneratingMatchingAnalysis = MatchingAnalysisVersionContext & {
  status: "generating"
  generatedAt: null
  failureReason: null
  result: null
}

export type CurrentMatchingAnalysis = MatchingAnalysisVersionContext & {
  /** Recorded dependency versions must match the current profile and JD versions. */
  status: "current"
  generatedAt: string
  failureReason: null
  result: MatchingAnalysisResult
}

export type StaleMatchingAnalysis = MatchingAnalysisVersionContext & {
  /** At least one recorded dependency version is older than its current counterpart. */
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

type TargetRoleBase = {
  id: string
  title: string
  company: string | null
  recruitmentType: TargetRoleRecruitmentType | null
  location: string | null
  /** Whether the saved role is available for active use or retained as an archive. */
  status: TargetRoleStatus
  createdAt: string
  updatedAt: string
  /** Increments for every persisted target-role mutation. */
  version: number
  /** Absent until a matching analysis has been requested. */
  matchingAnalysis: MatchingAnalysis | null
}

/**
 * The type parameter binds a ready JD to the version of its structured result.
 * Use a literal version argument where that value is statically known.
 */
export type ReadyTargetRole<JobDescriptionVersion extends number = number> = TargetRoleBase & {
  jobDescription: ReadyJobDescription & { version: JobDescriptionVersion }
  jobDescriptionAnalysis: JobDescriptionAnalysis & {
    jobDescriptionVersion: JobDescriptionVersion
  }
}

export type TargetRoleWithoutReadyJobDescription = TargetRoleBase &
  (
    | {
        jobDescription: MissingJobDescription
        jobDescriptionAnalysis: null
      }
    | {
        jobDescription: ParsingJobDescription
        jobDescriptionAnalysis: null
      }
    | {
        jobDescription: FailedJobDescription
        jobDescriptionAnalysis: null
      }
  )

export type TargetRole<JobDescriptionVersion extends number = number> =
  ReadyTargetRole<JobDescriptionVersion> | TargetRoleWithoutReadyJobDescription

export type MissingProfileContext = {
  exists: false
  version: null
  completed: false
}

export type ExistingProfileContext = {
  exists: true
  version: number
  completed: boolean
}

export type ProfileContext = MissingProfileContext | ExistingProfileContext

export type RolesPageResponse = {
  roles: TargetRole[]
  /**
   * The default role used by Dashboard and training, or `null` when no default exists.
   * A non-null ID must identify an active role in `roles`.
   */
  currentRoleId: string | null
  profileContext: ProfileContext
}

export type CreateTargetRoleInput = {
  title: string
  company: string | null
  recruitmentType: TargetRoleRecruitmentType | null
  location: string | null
}

export type TargetRoleImportSourceType = "text" | "image" | "url"

export type RecognizeTargetRoleInput =
  | {
      sourceType: "text"
      text: string
    }
  | {
      sourceType: "image"
      images: File[]
    }
  | {
      sourceType: "url"
      url: string
    }

export type UpdateTargetRoleInput = {
  roleId: string
  version: number
  title: string
  company: string | null
  recruitmentType: TargetRoleRecruitmentType | null
  location: string | null
}

export type SetCurrentTargetRoleInput = {
  roleId: string
  version: number
}

export type ArchiveTargetRoleInput = {
  roleId: string
  version: number
}

export type RestoreTargetRoleInput = {
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
  text: string
}

export type GetJobDescriptionParsingStatusInput = {
  roleId: string
  /** Target-role version returned when this parsing job entered parsing. */
  version: number
  jobDescriptionVersion: number
}

export type GenerateOrRegenerateMatchingAnalysisInput = {
  roleId: string
  /** Optimistic-concurrency version for the target role, not an analysis dependency. */
  version: number
}

export type GetMatchingAnalysisStatusInput = {
  roleId: string
  /** Target-role version returned when this generation entered generating. */
  version: number
}

export type JobDescriptionAnalysisListField =
  "responsibilities" | "preferredQualifications" | "softSkills" | "businessDomains"

export type JobDescriptionAnalysisModuleField =
  JobDescriptionAnalysisListField | "qualificationRequirements" | "requiredSkills"

export type UpdateJobDescriptionAnalysisModuleInput =
  | {
      roleId: string
      version: number
      jobDescriptionVersion: number
      analysisVersion: number
      field: JobDescriptionAnalysisListField
      value: string[]
    }
  | {
      roleId: string
      version: number
      jobDescriptionVersion: number
      analysisVersion: number
      field: "qualificationRequirements"
      value: QualificationRequirements
    }
  | {
      roleId: string
      version: number
      jobDescriptionVersion: number
      analysisVersion: number
      field: "requiredSkills"
      value: RequiredSkillGroups
    }
