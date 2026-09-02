import { ApiError } from "@/api/error"
import type {
  CareerProfileResponse,
  CreateCareerProfileRequest,
  ErrorCode,
  UpdateCareerProfileRequest,
} from "@/api/generated/models"
import {
  careerProfileFixture,
  resumeImportedCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"
import type { ResumeUploadInput } from "@/models/profile"

const createdAt = "2025-01-15T08:00:00Z"
const updatedAt = "2025-02-01T08:00:00Z"

function careerProfileError(code: ErrorCode, message: string): ApiError {
  return new ApiError({ error: { code, message } })
}

function validateSkills(profile: CareerProfileResponse) {
  const skills = new Set(profile.skills)
  const hasMismatch = profile.workExperiences.some((experience) =>
    experience.skills?.some((skill) => !skills.has(skill)),
  )

  if (hasMismatch) {
    throw careerProfileError(
      "career_profile.skill_mismatch",
      "Work experience skills must exist in the career profile skills list.",
    )
  }
}

export function createCareerProfileFaker(initialProfile: CareerProfileResponse | null) {
  let profile = initialProfile ? structuredClone(initialProfile) : null

  return {
    async get(): Promise<CareerProfileResponse> {
      if (!profile) {
        throw careerProfileError("career_profile.not_found", "Career profile was not found.")
      }

      return structuredClone(profile)
    },

    async create(input: CreateCareerProfileRequest): Promise<CareerProfileResponse> {
      if (profile) {
        throw careerProfileError("career_profile.already_exists", "Career profile already exists.")
      }

      const nextProfile: CareerProfileResponse = {
        education: structuredClone(input.education ?? []),
        workExperiences: structuredClone(input.workExperiences ?? []),
        projects: structuredClone(input.projects ?? []),
        skills: structuredClone(input.skills ?? []),
        createdAt,
        updatedAt: createdAt,
      }

      validateSkills(nextProfile)
      profile = nextProfile
      return structuredClone(profile)
    },

    async update(input: UpdateCareerProfileRequest): Promise<CareerProfileResponse> {
      if (!profile) {
        throw careerProfileError("career_profile.not_found", "Career profile was not found.")
      }

      const nextProfile: CareerProfileResponse = {
        education:
          input.education === undefined ? profile.education : structuredClone(input.education),
        workExperiences:
          input.workExperiences === undefined
            ? profile.workExperiences
            : structuredClone(input.workExperiences),
        projects: input.projects === undefined ? profile.projects : structuredClone(input.projects),
        skills: input.skills === undefined ? profile.skills : structuredClone(input.skills),
        createdAt: profile.createdAt,
        updatedAt,
      }

      validateSkills(nextProfile)
      profile = nextProfile
      return structuredClone(profile)
    },

    async importResume(input: ResumeUploadInput): Promise<CareerProfileResponse> {
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
