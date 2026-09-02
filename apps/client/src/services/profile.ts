import { ApiError } from "@/api/error"
import {
  createCareerProfile,
  getCareerProfile,
  updateCareerProfile,
} from "@/api/generated/endpoints/career-profile/career-profile"
import type { CareerProfileResponse, UpdateCareerProfileRequest } from "@/api/generated/models"
import { careerProfileFaker } from "@/mocks/fakers/career-profile"
import type { ResumeImportInput } from "@/models/resume"

export async function getProfile(): Promise<CareerProfileResponse | null> {
  try {
    return await getCareerProfile()
  } catch (error) {
    if (error instanceof ApiError && error.code === "resource.not_found") {
      return null
    }
    throw error
  }
}

export function createProfile(): Promise<CareerProfileResponse> {
  return createCareerProfile({})
}

export function updateProfile(input: UpdateCareerProfileRequest): Promise<CareerProfileResponse> {
  return updateCareerProfile(input)
}

export function importResume(input: ResumeImportInput): Promise<CareerProfileResponse> {
  return careerProfileFaker.importResume(input)
}
