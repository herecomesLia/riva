import { ApiError } from "@/api/error"
import type {
  ErrorCode,
  LoginCredentials,
  RegisterCredentials,
  UserResponse,
} from "@/api/generated/models"
import { authUserFixture } from "@/mocks/fixtures/auth"

function authError(code: ErrorCode, message: string): ApiError {
  return new ApiError({ error: { code, message } })
}

export const authFaker = {
  async login(credentials: LoginCredentials): Promise<UserResponse> {
    if (credentials.username === "invalid-user") {
      throw authError("auth.invalid_credentials", "Invalid username or password.")
    }
    return { ...authUserFixture }
  },

  async register(credentials: RegisterCredentials): Promise<UserResponse> {
    if (credentials.username === "taken-user") {
      throw authError("auth.username_taken", "Username is already registered.")
    }
    return { ...authUserFixture }
  },

  async logout(): Promise<void> {},

  async getCurrentUser(): Promise<UserResponse> {
    throw authError("auth.not_authenticated", "Authentication is required.")
  },
}
