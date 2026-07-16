export type ProfileStatus =
  "draft" | "uploadingResume" | "parsingResume" | "recognitionFailed" | "active"

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
  background: string | null
  responsibilities: string[]
  contributions: string[]
  achievements: string[]
  technologies: string[]
  projectUrl: string | null
  relatedWorkExperienceId: string | null
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
  status: ProfileStatus
  completeness: ProfileCompleteness
  updatedAt: string
  version: number
  matchingAnalysisStale: boolean
  resume: ResumeFile | null
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
  status: "uploading" | "parsing" | "succeeded" | "failed"
  changeSummary: ResumeImportChangeSummary | null
  failureReason: string | null
  preservesManualChanges: boolean
}

export type JobProfileSnapshot = {
  profile: JobProfile | null
  recognition: ResumeRecognition | null
  resumeUpdate: ResumeUpdate | null
  matchingAnalysis: MatchingAnalysis | null
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
}[Exclude<ProfileSection, "workExperience">]

export type NewProfileSkillInput = {
  clientId: string
  name: string
}

export type SaveWorkExperienceSectionInput = {
  profileId: string
  version: number
  section: "workExperience"
  values: WorkExperience[]
  skillsToCreate: NewProfileSkillInput[]
}

export type SaveProfileSectionInput =
  SaveStandardProfileSectionInput | SaveWorkExperienceSectionInput

export type ResumeUploadInput = {
  file?: File
  text?: string
}
