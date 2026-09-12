import { ApiError } from "@/api/error"
import {
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "@/api/generated/endpoints/auth/auth"
import { getCurrentUser as getCurrentUserRequest } from "@/api/generated/endpoints/users/users"
import type { LoginCredentials, RegisterCredentials, UserResponse } from "@/api/generated/models"

export type { LoginCredentials, RegisterCredentials } from "@/api/generated/models"

export async function login(credentials: LoginCredentials): Promise<UserResponse> {
  return loginRequest(credentials)
}

export async function logout(): Promise<void> {
  await logoutRequest()
}

export async function register(credentials: RegisterCredentials): Promise<UserResponse> {
  return registerRequest(credentials)
}

export async function getCurrentUser(signal?: AbortSignal): Promise<UserResponse | null> {
  try {
    return await getCurrentUserRequest({ signal })
  } catch (error) {
    if (error instanceof ApiError) {
      switch (error.code) {
        case "auth.invalid_session":
        case "auth.not_authenticated":
        case "auth.session_expired":
          return null
      }
    }
    throw error
  }
}
