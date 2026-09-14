import type {
  CareerProfileResponse,
  CareerProfileTextExtractionRequest,
  TaskStatusResponse,
  TaskFailureResponse,
  CreateCareerProfileRequest,
  EducationEntryRequest,
  EducationEntryResponse,
  ProjectEntryRequest,
  ProjectEntryResponse,
  UpdateCareerProfileRequest,
  WorkExperienceEntryRequest,
  WorkExperienceEntryResponse,
} from "@/api/generated/models"
import {
  careerProfileFixture,
  careerProfileFailInput,
  resumeImportedCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"
import { createMockApiError } from "@/mocks/utils"

const createdAt = "2025-01-15T08:00:00Z"

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
    throw createMockApiError(
      "domain.validation_failed",
      "Work experience skills must exist in the career profile skills list.",
    )
  }
}

export function createCareerProfileFaker(initialProfile: CareerProfileResponse | null) {
  let profile = initialProfile ? structuredClone(initialProfile) : null
  let extraction: {
    startedAt: number
    outcome: "success" | "failed"
    abortStartedAt?: number
  } | null = null

  // Reads advance the mock background job by elapsed time, as in the JD faker.
  function getExtractionState(): TaskStatusResponse | TaskFailureResponse {
    if (!extraction) return { status: "idle", error: null }
    if (extraction.abortStartedAt !== undefined) {
      if (Date.now() - extraction.abortStartedAt < 500) return { status: "aborting", error: null }
      extraction = null
      return { status: "idle", error: null }
    }
    const elapsed = Date.now() - extraction.startedAt
    if (elapsed < 500) return { status: "queued", error: null }
    if (elapsed < 2500) return { status: "running", error: null }
    if (extraction.outcome === "failed") {
      return {
        status: "failed",
        error: { code: "invalid_output", message: "Unable to complete the task." },
      }
    }
    const imported = structuredClone(resumeImportedCareerProfileFixture)
    const unchanged =
      profile &&
      JSON.stringify(normalizeSections(profile)) === JSON.stringify(normalizeSections(imported))
    profile = {
      ...imported,
      createdAt: profile?.createdAt ?? imported.createdAt,
      updatedAt: unchanged
        ? profile!.updatedAt
        : new Date(
            Math.max(Date.now(), Date.parse(profile?.updatedAt ?? imported.updatedAt) + 1),
          ).toISOString(),
    }
    extraction = null
    return { status: "idle", error: null }
  }

  function requireManualWrite() {
    const { status } = getExtractionState()
    if (status === "queued" || status === "running" || status === "aborting") {
      throw createMockApiError(
        "resource.conflict",
        "Abort the active extraction before editing the career profile.",
      )
    }
  }

  return {
    async getCareerProfile(): Promise<CareerProfileResponse> {
      getExtractionState()
      if (!profile) {
        throw createMockApiError("resource.not_found", "Career profile was not found.")
      }

      return structuredClone(profile)
    },

    async createCareerProfile(input: CreateCareerProfileRequest): Promise<CareerProfileResponse> {
      requireManualWrite()
      if (profile) {
        throw createMockApiError("resource.conflict", "Career profile already exists.")
      }

      const nextProfile: CareerProfileResponse = {
        ...normalizeSections(input),
        createdAt,
        updatedAt: createdAt,
      }

      validateSkills(nextProfile)
      profile = nextProfile
      extraction = null
      return structuredClone(profile)
    },

    async updateCareerProfile(input: UpdateCareerProfileRequest): Promise<CareerProfileResponse> {
      requireManualWrite()
      if (!profile) {
        throw createMockApiError("resource.not_found", "Career profile was not found.")
      }

      const nextProfile: CareerProfileResponse = {
        ...normalizeSections({
          education: input.education ?? profile.education,
          workExperiences: input.workExperiences ?? profile.workExperiences,
          projects: input.projects ?? profile.projects,
          skills: input.skills ?? profile.skills,
        }),
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      }

      validateSkills(nextProfile)
      if (
        JSON.stringify(normalizeSections(nextProfile)) !==
        JSON.stringify(normalizeSections(profile))
      ) {
        nextProfile.updatedAt = new Date(
          Math.max(Date.now(), Date.parse(profile.updatedAt) + 1),
        ).toISOString()
      }
      profile = nextProfile
      extraction = null
      return structuredClone(profile)
    },

    async extractCareerProfileFromText(input: CareerProfileTextExtractionRequest): Promise<void> {
      if (!input.text.trim()) {
        throw createMockApiError("request.validation_failed", "Resume text is required.")
      }
      getExtractionState()
      extraction = {
        startedAt: Date.now(),
        outcome: input.text.trim() === careerProfileFailInput ? "failed" : "success",
      }
    },
    async getCareerProfileExtractionState(): Promise<TaskStatusResponse | TaskFailureResponse> {
      return getExtractionState()
    },
    async retryCareerProfileExtraction(): Promise<void> {
      if (getExtractionState().status !== "failed")
        throw createMockApiError(
          "resource.conflict",
          "Only a failed career profile extraction can be retried.",
        )
      extraction = { startedAt: Date.now(), outcome: "success" }
    },
    async abortCareerProfileExtraction(): Promise<void> {
      const { status } = getExtractionState()
      if (status === "aborting") return
      if (status !== "queued" && status !== "running")
        throw createMockApiError(
          "resource.conflict",
          "Only an active career profile extraction can be aborted.",
        )
      extraction!.abortStartedAt = Date.now()
    },
  }
}

export const careerProfileFaker = createCareerProfileFaker(careerProfileFixture)
