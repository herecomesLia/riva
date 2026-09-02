import {
  getCreateCareerProfileMockHandler,
  getGetCareerProfileMockHandler,
  getUpdateCareerProfileMockHandler,
} from "@/api/generated/endpoints/career-profile/career-profile.msw"
import type { CreateCareerProfileRequest, UpdateCareerProfileRequest } from "@/api/generated/models"
import { careerProfileFaker as rawCareerProfileFaker } from "@/mocks/fakers/career-profile"
import { asMswFaker } from "@/mocks/handlers/adapter"

const careerProfileFaker = asMswFaker(rawCareerProfileFaker, {
  "career_profile.not_found": 404,
  "career_profile.already_exists": 409,
  "career_profile.skill_mismatch": 422,
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
