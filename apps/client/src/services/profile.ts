import { env } from "@/app/env"
import * as profileMockService from "@/mocks/services/profile"
import type {
  Profile,
  ProfileContent,
  ProfileSnapshot,
  ResumeUploadInput,
  SaveProfileInput,
} from "@/models/profile"
import {
  profileContentSchema,
  profileGetResponseSchema,
  profileResponseSchema,
  saveProfileInputSchema,
} from "@/schemas/profile"
import { apiRequest } from "@/services/api"

function createResumeForm(input: ResumeUploadInput): FormData {
  const hasFile = input.file !== undefined
  const hasText = input.text !== undefined
  if (hasFile === hasText) {
    throw new TypeError("Exactly one of file or text is required for a resume import.")
  }
  if (input.text !== undefined && !input.text.trim()) {
    throw new TypeError("Resume text must not be empty.")
  }

  const form = new FormData()
  if (input.file !== undefined) form.append("file", input.file)
  if (input.text !== undefined) form.append("text", input.text)
  return form
}

export async function getProfile(): Promise<ProfileSnapshot> {
  if (env.mock) return profileMockService.getProfile()
  return profileGetResponseSchema.parse(await apiRequest<unknown>("/profile"))
}

export async function saveProfile(input: SaveProfileInput): Promise<Profile> {
  const request = saveProfileInputSchema.parse(input)
  if (env.mock) return profileMockService.saveProfile(request)

  return profileResponseSchema.parse(
    await apiRequest<unknown>("/profile", {
      json: request,
      method: "PUT",
    }),
  )
}

export async function importFromResume(input: ResumeUploadInput): Promise<ProfileContent> {
  const form = createResumeForm(input)
  if (env.mock) return profileMockService.importFromResume(input)

  return profileContentSchema.parse(
    await apiRequest<unknown>("/profile/import/resume", {
      body: form,
      method: "POST",
    }),
  )
}
