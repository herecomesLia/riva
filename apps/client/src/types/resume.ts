export type ResumeSetupStatus = 'not_started' | 'draft' | 'parsed' | 'completed'

export type ResumeStepStatus = 'done' | 'current' | 'todo'

export type ResumeSetupStep = {
  id: string
  title: string
  description: string
  status: ResumeStepStatus
}

export type ResumeBasicInfo = {
  name: string
  email: string
  phone: string
  location: string
  yearsOfExperience: string
  targetTitle: string
  jobDirection: string
}

export type ResumeExperience = {
  id: string
  title: string
  organization: string
  period: string
  description: string
  degree?: string
  sourceText?: string
}

export type ResumeProject = {
  id: string
  name: string
  role: string
  summary: string
  highlights: string[]
  sourceText: string
}

export type ResumeProfile = {
  id: string
  status: ResumeSetupStatus
  completion: number
  updatedAt: string
  basicInfo: ResumeBasicInfo
  education: ResumeExperience[]
  workExperience: ResumeExperience[]
  projects: ResumeProject[]
  skills: string[]
  certificates: string[]
  targetJob: string
  jobDirection: string
}

export type ResumeSetupGuide = {
  status: ResumeSetupStatus
  acceptedFormats: string[]
  sampleText: string
  steps: ResumeSetupStep[]
  profile: ResumeProfile | null
}

export type ResumeParseInput = {
  source: 'paste' | 'upload'
  text?: string
  fileName?: string
}

export type ResumeProfileResult = {
  profile: ResumeProfile | null
}

export type SaveResumeProfileInput = {
  profile: ResumeProfile
}
