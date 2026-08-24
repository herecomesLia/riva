import {
  createProfileMockSnapshot,
  profileResponseMock,
  type ProfileMockScenario,
} from "@/mocks/data/profile"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  Profile,
  ProfileContent,
  ProfileSnapshot,
  ResumeUploadInput,
  SaveProfileInput,
} from "@/models/profile"
import { ApiError } from "@/services/api"

let mockProfile: ProfileSnapshot = structuredClone(profileResponseMock)

function copy<T>(value: T): T {
  return structuredClone(value)
}

export function resetProfileMockState(scenario: ProfileMockScenario = "complete") {
  mockProfile = createProfileMockSnapshot(scenario)
}

export function getProfile(): Promise<ProfileSnapshot> {
  return waitForMockDelay().then(() => copy(mockProfile))
}

export function getProfileMockSnapshot(): ProfileSnapshot {
  return copy(mockProfile)
}

export async function saveProfile(input: SaveProfileInput): Promise<Profile> {
  await waitForMockDelay()
  if (mockProfile === null) {
    if (input.version !== null) {
      throw new ApiError(409, "profile_version_conflict", {
        error: "profile_version_conflict",
      })
    }
    mockProfile = {
      content: copy(input.content),
      updatedAt: new Date().toISOString(),
      version: 1,
    }
    return copy(mockProfile)
  }

  if (input.version !== mockProfile.version) {
    throw new ApiError(409, "profile_version_conflict", {
      error: "profile_version_conflict",
    })
  }
  mockProfile = {
    content: copy(input.content),
    updatedAt: new Date().toISOString(),
    version: mockProfile.version + 1,
  }
  return copy(mockProfile)
}

export async function importFromResume(_input: ResumeUploadInput): Promise<ProfileContent> {
  await waitForMockDelay()
  return copy(mockProfile?.content ?? profileResponseMock.content)
}
