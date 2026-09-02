import {
  getCreateCareerProfileMockHandler,
  getGetCareerProfileMockHandler,
  getUpdateCareerProfileMockHandler,
} from "@/api/generated/endpoints/career-profile/career-profile.msw"
import type { CreateCareerProfileRequest, UpdateCareerProfileRequest } from "@/api/generated/models"
import { careerProfileFaker as rawCareerProfileFaker } from "@/mocks/fakers/career-profile"
import { asMswFaker } from "@/mocks/handlers/adapter"

const careerProfileFaker = asMswFaker(rawCareerProfileFaker, {
  "resource.not_found": 404,
  "resource.conflict": 409,
  "domain.validation_failed": 422,
})

export const careerProfileHandlers = [
  getGetCareerProfileMockHandler(() => careerProfileFaker.get()),
  getCreateCareerProfileMockHandler(async ({ request }) => {
    const input = (await request.json()) as CreateCareerProfileRequest
    return careerProfileFaker.create(input)
  }),
  getUpdateCareerProfileMockHandler(async ({ request }) => {
    const input = (await request.json()) as UpdateCareerProfileRequest
    return careerProfileFaker.update(input)
  }),
]
