import type { UserResponse } from "@/api/generated/models"

export const authUserFixture = {
  avatarUrl: null,
  displayName: "Riva User",
  id: "8f3d275e-b578-4d9a-8b0d-49f72887b25b",
  username: "rivauser",
} as const satisfies UserResponse
