import { ApiError } from "@/api/error"
import type {
  ErrorCode,
  ErrorResponse,
  LoginCredentials,
  RegisterCredentials,
  UserResponse,
} from "@/api/generated/models"
import { authUserFixture } from "@/mocks/fixtures/auth"

function authError(status: number, code: ErrorCode, message: string): ApiError {
  const response: ErrorResponse = {
    error: { code, message },
  }
  return new ApiError(status, response, message)
}

export async function login(credentials: LoginCredentials): Promise<UserResponse> {
  if (credentials.username === "invalid-user") {
    throw authError(401, "auth.invalid_credentials", "Invalid username or password.")
  }
  return { ...authUserFixture }
}

export async function register(credentials: RegisterCredentials): Promise<UserResponse> {
  if (credentials.username === "taken-user") {
    throw authError(409, "auth.username_taken", "Username is already registered.")
  }
  return { ...authUserFixture }
}

export async function logout(): Promise<void> {}

export async function getCurrentUser(): Promise<UserResponse> {
  throw authError(401, "auth.not_authenticated", "Authentication is required.")
}
