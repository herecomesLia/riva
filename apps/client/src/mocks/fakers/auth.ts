import type { LoginCredentials, RegisterCredentials, UserResponse } from "@/api/generated/models"
import { authUserFixture } from "@/mocks/fixtures/auth"
import { createMockApiError } from "@/mocks/utils"

export const authFaker = {
  async login(credentials: LoginCredentials): Promise<UserResponse> {
    if (credentials.username === "invalid-user") {
      throw createMockApiError("auth.invalid_credentials", "Invalid username or password.")
    }
    return { ...authUserFixture }
  },

  async register(credentials: RegisterCredentials): Promise<UserResponse> {
    if (credentials.username === "taken-user") {
      throw createMockApiError("auth.username_taken", "Username is already registered.")
    }
    return { ...authUserFixture }
  },

  async logout(): Promise<void> {},

  async getCurrentUser(): Promise<UserResponse> {
    throw createMockApiError("auth.not_authenticated", "Authentication is required.")
  },
}
