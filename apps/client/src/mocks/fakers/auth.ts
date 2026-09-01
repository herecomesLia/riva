import type { LoginCredentials, UserResponse } from "@/api/generated/models"
import { authCredentialsFixture, authUserFixture } from "@/mocks/fixtures/auth"

export function createAuthFaker() {
  let currentUser: UserResponse | null = null

  return {
    getCurrentUser(): UserResponse | null {
      return currentUser ? { ...currentUser } : null
    },
    login(credentials: LoginCredentials): UserResponse | null {
      if (
        credentials.username !== authCredentialsFixture.username ||
        credentials.password !== authCredentialsFixture.password
      ) {
        return null
      }

      currentUser = { ...authUserFixture }
      return { ...currentUser }
    },
    logout(): void {
      currentUser = null
    },
    reset(): void {
      currentUser = null
    },
  }
}

export const authFaker = createAuthFaker()
