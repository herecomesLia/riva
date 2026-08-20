export type ProfileStatus = "active"

export type ProfileSource = "resumeExtracted" | "userEdited" | "userAdded"

export type ResumeProcessingStatus = "uploaded" | "parsing" | "succeeded" | "failed"

export type ProfileSection =
  "education" | "workExperience" | "projectExperience" | "skills" | "credentials" | "targetRoles"

export type ProfileCompleteness = {
  percentage: number
  missingSections: ProfileSection[]
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

export type EducationExperience = {
  id: string
  school: string
  degree: string | null
  major: string | null
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
  source: ProfileSource
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
}

export type ProjectExperience = {
  id: string
  name: string
  role: string | null
  startDate: string | null
  endDate: string | null
  responsibilities: string[]
  achievements: string[]
  skillIds: string[]
  projectUrl: string | null
  source: ProfileSource
}

export type ProfileSkill = {
  id: string
  name: string
  source: ProfileSource
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
}

export type TargetRoleSummary = {
  id: string
  title: string
  company: string | null
  location: string | null
  source: ProfileSource
}

export type JobProfile = {
  profileId: string
  summary: string | null
  status: ProfileStatus
  completeness: ProfileCompleteness
  updatedAt: string
  version: number
  resume: ResumeFile | null
  education: EducationExperience[]
  workExperiences: WorkExperience[]
  projectExperiences: ProjectExperience[]
  skills: ProfileSkill[]
  credentials: Credential[]
  targetRoles: TargetRoleSummary[]
}

export type ResumeDocumentSourceType = "file" | "pastedText"

export type ResumeExtractionStatus = "pending" | "succeeded" | "failed"

export type ResumeDocument = {
  id: string
  sourceType: ResumeDocumentSourceType
  originalFilename: string | null
  mediaType: string
  byteSize: number
  uploadedAt: string
  extractionStatus: ResumeExtractionStatus
  extractedAt: string | null
  failureReason: string | null
}

export type ResumeDocumentDto = ResumeDocument

export type ResumeDocumentsResponseDto = {
  documents: ResumeDocument[]
}

export type ResumeParsingLifecycleStatus =
  "notStarted" | "queued" | "running" | "succeeded" | "failed"

export type ResumeImportDraftLifecycleStatus = "ready" | "applied" | "superseded"

export type ResumeParsingStatus = {
  resumeDocumentId: string
  status: ResumeParsingLifecycleStatus
  runId: string | null
  attemptCount: number
  maxAttempts: number | null
  errorCode: string | null
  failureReason: string | null
  canRetry: boolean
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
  resultVersion: number | null
  draftVersion: number | null
  draftStatus: ResumeImportDraftLifecycleStatus | null
}

export type ResumeParsingStatusDto = ResumeParsingStatus

export type ResumeImportSection =
  "education" | "workExperience" | "projectExperience" | "skills" | "summary"

export type ResumeImportSkipReason =
  | "start_date_missing"
  | "start_date_precision_insufficient"
  | "end_date_missing"
  | "end_date_precision_insufficient"
  | "current_status_unknown"
  | "employment_type_unknown"
  | "profile_schema_invalid"

export type ResumeImportProtectedSource = "userEdited" | "userAdded"

export type ResumeImportSummaryAction = "set" | "preserve" | "none"

export type ResumeImportSkippedItem = {
  section: ResumeImportSection
  sourceIndex: number
  reasons: ResumeImportSkipReason[]
}

export type ResumeImportProtectedItem = {
  section: ResumeImportSection
  itemId: string
  source: ResumeImportProtectedSource
}

export type ResumeImportChangeSummary = {
  newItems: number
  changedItems: number
  missingItems: number
}

export type ResumeImportDraft = {
  resumeDocumentId: string
  sourceRunId: string
  parsingResultVersion: number
  draftVersion: number
  status: ResumeImportDraftLifecycleStatus
  baseProfileId: string | null
  baseProfileVersion: number | null
  appliedProfileVersion: number | null
  appliedAt: string | null
  canApply: boolean
  summary: string | null
  summaryAction: ResumeImportSummaryAction
  education: CareerProfileEducationInputDto[]
  workExperiences: CareerProfileWorkExperienceInputDto[]
  projectExperiences: CareerProfileProjectExperienceInputDto[]
  skills: CareerProfileSkillInputDto[]
  unresolvedItems: string[]
  skippedItems: ResumeImportSkippedItem[]
  protectedItems: ResumeImportProtectedItem[]
  changeSummary: ResumeImportChangeSummary
  createdAt: string
  updatedAt: string
}

export type ResumeImportDraftDto = ResumeImportDraft

export type ResumeImportApplication = {
  draft: ResumeImportDraft
  profile: CareerProfileDto
  profileCreated: boolean
  profileChanged: boolean
}

export type ResumeImportApplicationDto = ResumeImportApplication

export type JobProfileSnapshot = {
  profile: JobProfile | null
}

export type ProfileCapabilities = {
  credentials: boolean
  resumeImport: boolean
  targetRoles: boolean
}

export type CareerProfileEducationInputDto = {
  id: string
  school: string
  degree: string | null
  major: string | null
  startDate: string
  endDate: string | null
  isCurrent: boolean
}

export type CareerProfileEducationDto = CareerProfileEducationInputDto & {
  source: ProfileSource
}

export type CareerProfileWorkExperienceInputDto = {
  id: string
  company: string
  title: string
  employmentType: EmploymentType
  location: string | null
  startDate: string
  endDate: string | null
  isCurrent: boolean
  responsibilities: string[]
  achievements: string[]
  skillIds: string[]
}

export type CareerProfileWorkExperienceDto = CareerProfileWorkExperienceInputDto & {
  source: ProfileSource
}

export type CareerProfileProjectExperienceInputDto = {
  id: string
  name: string
  role: string | null
  startDate: string
  endDate: string | null
  responsibilities: string[]
  achievements: string[]
  skillIds: string[]
  projectUrl: string | null
}

export type CareerProfileProjectExperienceDto = CareerProfileProjectExperienceInputDto & {
  source: ProfileSource
}

export type CareerProfileSkillInputDto = {
  id: string
  name: string
}

export type CareerProfileSkillDto = CareerProfileSkillInputDto & {
  source: ProfileSource
}

export type CareerProfileDto = {
  profileId: string
  summary: string | null
  version: number
  updatedAt: string
  education: CareerProfileEducationDto[]
  workExperiences: CareerProfileWorkExperienceDto[]
  projectExperiences: CareerProfileProjectExperienceDto[]
  skills: CareerProfileSkillDto[]
}

export type CareerProfileGetResponseDto = {
  profile: CareerProfileDto | null
}

export type CareerProfilePutRequestDto = {
  version: number | null
  summary: string | null
  education: CareerProfileEducationInputDto[]
  workExperiences: CareerProfileWorkExperienceInputDto[]
  projectExperiences: CareerProfileProjectExperienceInputDto[]
  skills: CareerProfileSkillInputDto[]
}

export type CareerProfilePutResponseDto = {
  profile: CareerProfileDto
}

export type ProfileSectionValueMap = {
  education: EducationExperience[]
  workExperience: WorkExperience[]
  projectExperience: ProjectExperience[]
  skills: ProfileSkill[]
  credentials: Credential[]
  targetRoles: TargetRoleSummary[]
}

type SaveStandardProfileSectionInput = {
  [Section in ProfileSection]: {
    profileId: string
    version: number
    section: Section
    values: ProfileSectionValueMap[Section]
  }
}[Exclude<ProfileSection, "workExperience" | "projectExperience">]

export type NewProfileSkillInput = {
  clientId: string
  name: string
}

type SkillLinkedProfileSection = "workExperience" | "projectExperience"

type SaveSkillLinkedSectionInput = {
  [Section in SkillLinkedProfileSection]: {
    profileId: string
    version: number
    section: Section
    values: ProfileSectionValueMap[Section]
    skillsToCreate: NewProfileSkillInput[]
  }
}[SkillLinkedProfileSection]

export type SaveProfileSectionInput = SaveStandardProfileSectionInput | SaveSkillLinkedSectionInput

export type ResumeUploadInput = {
  file?: File
  text?: string
}
