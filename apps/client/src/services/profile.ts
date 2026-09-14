import { ApiError } from "@/api/error"
import { getCareerProfileApi } from "@/api/generated/endpoints/career-profile/career-profile"
import type {
  CareerProfileResponse,
  CareerProfileTextExtractionRequest,
  CreateCareerProfileRequest,
  UpdateCareerProfileRequest,
} from "@/api/generated/models"

const careerProfileApi = getCareerProfileApi()

export async function getCareerProfile(
  signal?: AbortSignal,
): Promise<CareerProfileResponse | null> {
  try {
    return await careerProfileApi.getCareerProfile({ signal })
  } catch (error) {
    if (error instanceof ApiError && error.code === "resource.not_found") {
      return null
    }
    throw error
  }
}

export function createCareerProfile(
  input: CreateCareerProfileRequest,
): Promise<CareerProfileResponse> {
  return careerProfileApi.createCareerProfile(input)
}

export function updateCareerProfile(
  input: UpdateCareerProfileRequest,
): Promise<CareerProfileResponse> {
  return careerProfileApi.updateCareerProfile(input)
}

export function extractCareerProfileFromText(
  input: CareerProfileTextExtractionRequest,
): Promise<void> {
  return careerProfileApi.extractCareerProfileFromText(input)
}

export function getCareerProfileExtractionState(signal?: AbortSignal) {
  return careerProfileApi.getCareerProfileExtractionState({ signal })
}

export function retryCareerProfileExtraction(): Promise<void> {
  return careerProfileApi.retryCareerProfileExtraction()
}

export function abortCareerProfileExtraction(): Promise<void> {
  return careerProfileApi.abortCareerProfileExtraction()
}
