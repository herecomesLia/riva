export type EmploymentType = "fullTime" | "partTime" | "internship" | "contract" | "freelance"

export type ProfileSection = "education" | "workExperience" | "projectExperience" | "skills"

export type ProfileEducation = {
  school: string
  degree: string | null
  major: string | null
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
}

export type ProfileWorkExperience = {
  company: string
  title: string
  employmentType: EmploymentType | null
  location: string | null
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
  responsibilities: string[]
  achievements: string[]
  skills: string[]
}

export type ProfileProjectExperience = {
  name: string
  role: string | null
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
  responsibilities: string[]
  achievements: string[]
  skills: string[]
  projectUrl: string | null
}

export type ProfileContent = {
  summary: string | null
  education: ProfileEducation[]
  workExperiences: ProfileWorkExperience[]
  projectExperiences: ProfileProjectExperience[]
  skills: string[]
}

export type Profile = {
  version: number
  updatedAt: string
  content: ProfileContent
}

export type ProfileSnapshot = Profile | null

export type SaveProfileInput = {
  version: number | null
  content: ProfileContent
}

export type ResumeUploadInput = {
  file?: File
  text?: string
}

export type ProfileSectionValueMap = {
  education: ProfileEducation[]
  workExperience: ProfileWorkExperience[]
  projectExperience: ProfileProjectExperience[]
  skills: string[]
}
