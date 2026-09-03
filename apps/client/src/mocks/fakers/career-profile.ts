import { ApiError } from "@/api/error"
import type {
  CareerProfileResponse,
  CreateCareerProfileRequest,
  EducationEntryRequest,
  EducationEntryResponse,
  ErrorCode,
  ProjectEntryRequest,
  ProjectEntryResponse,
  UpdateCareerProfileRequest,
  WorkExperienceEntryRequest,
  WorkExperienceEntryResponse,
} from "@/api/generated/models"
import {
  careerProfileFixture,
  resumeImportedCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"
import type { ResumeImportInput } from "@/models/resume"

const createdAt = "2025-01-15T08:00:00Z"
const updatedAt = "2025-02-01T08:00:00Z"

function careerProfileError(code: ErrorCode, message: string): ApiError {
  return new ApiError({ error: { code, message, issues: [] } })
}

type CareerProfileSections = Pick<
  CareerProfileResponse,
  "education" | "workExperiences" | "projects" | "skills"
>

function normalizeSections(input: {
  education?: EducationEntryRequest[]
  workExperiences?: WorkExperienceEntryRequest[]
  projects?: ProjectEntryRequest[]
  skills?: string[]
}): CareerProfileSections {
  return {
    education: (input.education ?? []).map((entry) =>
      structuredClone({
        degree: null,
        major: null,
        ...entry,
      } as EducationEntryResponse),
    ),
    workExperiences: (input.workExperiences ?? []).map((entry) =>
      structuredClone({
        employmentType: null,
        location: null,
        responsibilities: [],
        achievements: [],
        skills: [],
        ...entry,
      } as WorkExperienceEntryResponse),
    ),
    projects: (input.projects ?? []).map((entry) =>
      structuredClone({
        role: null,
        description: [],
        achievements: [],
        techStack: [],
        url: null,
        ...entry,
      } as ProjectEntryResponse),
    ),
    skills: structuredClone(input.skills ?? []),
  }
}

function validateSkills(profile: CareerProfileResponse) {
  const skills = new Set(profile.skills)
  const hasMismatch = profile.workExperiences.some((experience) =>
    experience.skills.some((skill) => !skills.has(skill)),
  )

  if (hasMismatch) {
    throw careerProfileError(
      "domain.validation_failed",
      "Work experience skills must exist in the career profile skills list.",
    )
  }
}

export function createCareerProfileFaker(initialProfile: CareerProfileResponse | null) {
  let profile = initialProfile ? structuredClone(initialProfile) : null

  return {
    async get(): Promise<CareerProfileResponse> {
      if (!profile) {
        throw careerProfileError("resource.not_found", "Career profile was not found.")
      }

      return structuredClone(profile)
    },

    async create(input: CreateCareerProfileRequest): Promise<CareerProfileResponse> {
      if (profile) {
        throw careerProfileError("resource.conflict", "Career profile already exists.")
      }

      const nextProfile: CareerProfileResponse = {
        ...normalizeSections(input),
        createdAt,
        updatedAt: createdAt,
      }

      validateSkills(nextProfile)
      profile = nextProfile
      return structuredClone(profile)
    },

    async update(input: UpdateCareerProfileRequest): Promise<CareerProfileResponse> {
      if (!profile) {
        throw careerProfileError("resource.not_found", "Career profile was not found.")
      }

      const nextProfile: CareerProfileResponse = {
        ...normalizeSections({
          education: input.education ?? profile.education,
          workExperiences: input.workExperiences ?? profile.workExperiences,
          projects: input.projects ?? profile.projects,
          skills: input.skills ?? profile.skills,
        }),
        createdAt: profile.createdAt,
        updatedAt,
      }

      validateSkills(nextProfile)
      profile = nextProfile
      return structuredClone(profile)
    },

    async importResume(input: ResumeImportInput): Promise<CareerProfileResponse> {
      if (!input.file && !input.text?.trim()) {
        throw new Error("A resume file or pasted resume text is required.")
      }

      const imported = structuredClone(resumeImportedCareerProfileFixture)
      const nextProfile: CareerProfileResponse = {
        ...imported,
        createdAt: profile?.createdAt ?? imported.createdAt,
      }

      validateSkills(nextProfile)
      profile = nextProfile
      return structuredClone(profile)
    },
  }
}

export const careerProfileFaker = createCareerProfileFaker(careerProfileFixture)
