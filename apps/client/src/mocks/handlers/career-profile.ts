import {
  getCreateCareerProfileMockHandler,
  getGetCareerProfileMockHandler,
  getUpdateCareerProfileMockHandler,
  getExtractCareerProfileFromTextMockHandler,
  getGetCareerProfileExtractionStateMockHandler,
  getRetryCareerProfileExtractionMockHandler,
  getAbortCareerProfileExtractionMockHandler,
} from "@/api/generated/endpoints/career-profile/career-profile.msw"
import type {
  CareerProfileTextExtractionRequest,
  CreateCareerProfileRequest,
  UpdateCareerProfileRequest,
} from "@/api/generated/models"
import { careerProfileFaker as rawCareerProfileFaker } from "@/mocks/fakers/career-profile"
import { asMswFaker } from "@/mocks/handlers/adapter"

const careerProfileFaker = asMswFaker(rawCareerProfileFaker, {
  "resource.not_found": 404,
  "resource.conflict": 409,
  "domain.validation_failed": 422,
  "request.validation_failed": 422,
})

export const careerProfileHandlers = [
  getGetCareerProfileMockHandler(() => careerProfileFaker.getCareerProfile()),
  getCreateCareerProfileMockHandler(async ({ request }) => {
    const input = (await request.json()) as CreateCareerProfileRequest
    return careerProfileFaker.createCareerProfile(input)
  }),
  getUpdateCareerProfileMockHandler(async ({ request }) => {
    const input = (await request.json()) as UpdateCareerProfileRequest
    return careerProfileFaker.updateCareerProfile(input)
  }),
  getExtractCareerProfileFromTextMockHandler(async ({ request }) => {
    const input = (await request.json()) as CareerProfileTextExtractionRequest
    return careerProfileFaker.extractCareerProfileFromText(input)
  }),
  getGetCareerProfileExtractionStateMockHandler(() =>
    careerProfileFaker.getCareerProfileExtractionState(),
  ),
  getRetryCareerProfileExtractionMockHandler(() =>
    careerProfileFaker.retryCareerProfileExtraction(),
  ),
  getAbortCareerProfileExtractionMockHandler(() =>
    careerProfileFaker.abortCareerProfileExtraction(),
  ),
]
