export type ProfileStatus =
  | "draft"
  | "uploadingResume"
  | "parsingResume"
  | "recognitionFailed"
  | "awaitingConfirmation"
  | "active"

export type ProfileReviewStatus = "confirmed" | "needsReview" | "incomplete"

export type ProfileSource = "resumeExtracted" | "userEdited" | "userAdded"

export type ResumeProcessingStatus = "uploaded" | "parsing" | "succeeded" | "failed"

export type ProfileSection =
  | "basicInformation"
  | "education"
  | "workExperience"
  | "projectExperience"
  | "skills"
  | "credentials"
  | "targetRoles"

export type ProfileCompleteness = {
  percentage: number
  missingSections: ProfileSection[]
  needsReviewSections: ProfileSection[]
}

export type ResumeFile = {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  uploadedAt: string
  parsedAt: string | null
  processingStatus: ResumeProcessingStatus
  failureReason: string | null
}

export type BasicInformation = {
  name: string | null
  professionalTitle: string | null
  location: string | null
  email: string | null
  phone: string | null
  personalSummary: string | null
  portfolioUrl: string | null
  githubUrl: string | null
  linkedinUrl: string | null
  fieldSources: Partial<Record<Exclude<keyof BasicInformation, "fieldSources">, ProfileSource>>
  reviewStatus: ProfileReviewStatus
}

export type EducationExperience = {
  id: string
  school: string
  degree: string | null
  major: string | null
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
  description: string | null
  source: ProfileSource
  reviewStatus: ProfileReviewStatus
}

export type EmploymentType = "fullTime" | "partTime" | "internship" | "contract" | "freelance"

export type WorkExperience = {
  id: string
  company: string
  title: string
  employmentType: EmploymentType
  location: string | null
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
  responsibilities: string[]
  achievements: string[]
  skillIds: string[]
  source: ProfileSource
  reviewStatus: ProfileReviewStatus
}

export type ProjectExperience = {
  id: string
  name: string
  role: string | null
  startDate: string | null
  endDate: string | null
  background: string | null
  responsibilities: string[]
  contributions: string[]
  achievements: string[]
  technologies: string[]
  projectUrl: string | null
  relatedWorkExperienceId: string | null
  source: ProfileSource
  reviewStatus: ProfileReviewStatus
}

export type ProfileSkill = {
  id: string
  name: string
  category: string | null
  source: ProfileSource
  reviewStatus: ProfileReviewStatus
}

export type Credential = {
  id: string
  type: "certificate" | "award"
  name: string
  issuer: string | null
  awardedAt: string | null
  expiresAt: string | null
  credentialId: string | null
  credentialUrl: string | null
  description: string | null
  source: ProfileSource
  reviewStatus: ProfileReviewStatus
}

export type TargetRoleSummary = {
  id: string
  title: string
  company: string | null
  location: string | null
  source: ProfileSource
  reviewStatus: ProfileReviewStatus
}

export type JobProfile = {
  profileId: string
  status: ProfileStatus
  completeness: ProfileCompleteness
  updatedAt: string
  version: number
  pendingReviewCount: number
  matchingAnalysisStale: boolean
  resume: ResumeFile | null
  basicInformation: BasicInformation
  education: EducationExperience[]
  workExperiences: WorkExperience[]
  projectExperiences: ProjectExperience[]
  skills: ProfileSkill[]
  credentials: Credential[]
  targetRoles: TargetRoleSummary[]
}

export type ResumeRecognition = {
  resumeId: string
  processingStatus: ResumeProcessingStatus
  completedAt: string | null
  failureReason: string | null
  pendingReviewCount: number
}

export type ResumeImportChangeSummary = {
  changedItems: number
  missingItems: number
  newItems: number
}

export type MatchingAnalysis = {
  failureReason: string | null
  generatedAt: string | null
  profileVersion: number
  status: "current" | "stale" | "regenerating" | "failed"
}

export type ResumeUpdate = {
  id: string
  resume: ResumeFile
  createdAt: string
  status: "uploading" | "parsing" | "awaitingConfirmation" | "failed"
  pendingReviewCount: number
  changeSummary: ResumeImportChangeSummary | null
  failureReason: string | null
  proposedProfile: JobProfile | null
  preservesManualChanges: boolean
}

export type JobProfileSnapshot = {
  profile: JobProfile | null
  recognition: ResumeRecognition | null
  resumeUpdate: ResumeUpdate | null
  matchingAnalysis: MatchingAnalysis | null
}

export type ProfileSectionValueMap = {
  basicInformation: BasicInformation
  education: EducationExperience[]
  workExperience: WorkExperience[]
  projectExperience: ProjectExperience[]
  skills: ProfileSkill[]
  credentials: Credential[]
  targetRoles: TargetRoleSummary[]
}

export type SaveProfileSectionInput = {
  [Section in ProfileSection]: {
    profileId: string
    version: number
    section: Section
    values: ProfileSectionValueMap[Section]
  }
}[ProfileSection]

export type ResumeUploadInput = {
  file?: File
  text?: string
}

export type ResumeRecognitionConfirmationInput = {
  profileId: string
  resumeId: string
}

export type ResumeUpdateDecisionInput = {
  profileId: string
  resumeUpdateId: string
}
