import { ApiError } from "@/api/error"
import {
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "@/api/generated/endpoints/auth/auth"
import { getCurrentUser } from "@/api/generated/endpoints/users/users"
import type { LoginCredentials, RegisterCredentials, UserResponse } from "@/api/generated/models"
import type { User } from "@/models/auth"

export type { LoginCredentials, RegisterCredentials } from "@/api/generated/models"

function mapUser(user: UserResponse): User {
  const fallbackSource = user.displayName.trim() || user.username

  return {
    avatarFallback: fallbackSource.charAt(0).toUpperCase(),
    avatarUrl: user.avatarUrl ?? undefined,
    displayName: user.displayName,
    id: user.id,
    username: user.username,
  }
}

export async function login(credentials: LoginCredentials): Promise<User> {
  return mapUser(await loginRequest(credentials))
}

export async function logout(): Promise<void> {
  await logoutRequest()
}

export async function register(credentials: RegisterCredentials): Promise<User> {
  return mapUser(await registerRequest(credentials))
}

export async function restoreCurrentUser(): Promise<User | null> {
  try {
    return mapUser(await getCurrentUser())
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}
