import { ApiError } from "@/api/error"
import { getAuthApi } from "@/api/generated/endpoints/auth/auth"
import { getUsersApi } from "@/api/generated/endpoints/users/users"
import type { LoginCredentials, RegisterCredentials, UserResponse } from "@/api/generated/models"

export type { LoginCredentials, RegisterCredentials } from "@/api/generated/models"

const authApi = getAuthApi()
const usersApi = getUsersApi()

export async function login(credentials: LoginCredentials): Promise<UserResponse> {
  return authApi.login(credentials)
}

export async function logout(): Promise<void> {
  await authApi.logout()
}

export async function register(credentials: RegisterCredentials): Promise<UserResponse> {
  return authApi.register(credentials)
}

export async function getCurrentUser(signal?: AbortSignal): Promise<UserResponse | null> {
  try {
    return await usersApi.getCurrentUser({ signal })
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
