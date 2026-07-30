import { env } from "@/app/env"
import { mockLoginCredentials, userMock } from "@/mocks/data/auth"
import { waitForMockDelay } from "@/mocks/utils"
import {
  LoginError,
  type AuthenticatedUser,
  type LoginCredentials,
  type User,
  type UserAccountDto,
} from "@/models/auth"
import { authenticatedUserSchema, userAccountSchema } from "@/schemas/auth"
import { apiRequest, ApiError } from "@/services/api"

export type { AuthenticatedUser, LoginCredentials, LoginErrorCode } from "@/models/auth"
export { LoginError, isLoginError } from "@/models/auth"

const authDelayMs = 500

function createUserMockCopy(): User {
  return { ...userMock }
}

function deriveAvatarFallback(displayName: string, username: string): string {
  const parts = (displayName.trim() || username.trim()).split(/\s+/)
  const initials =
    parts.length === 1
      ? Array.from(parts[0] ?? "")[0]
      : `${Array.from(parts[0] ?? "")[0] ?? ""}${Array.from(parts.at(-1) ?? "")[0] ?? ""}`

  return initials?.toUpperCase() ?? ""
}

function createUser(account: UserAccountDto): User {
  return {
    ...account,
    avatarFallback: deriveAvatarFallback(account.displayName, account.username),
    avatarUrl: account.avatarUrl ?? null,
  }
}

function mapLoginError(error: unknown): LoginError {
  if (error instanceof ApiError && error.status === 401 && error.code === "invalid_credentials") {
    return new LoginError("invalidCredentials")
  }

  if (error instanceof TypeError || (error instanceof ApiError && error.status === 503)) {
    return new LoginError("serviceUnavailable")
  }

  return new LoginError("unknown")
}

export async function login(credentials: LoginCredentials): Promise<User> {
  if (env.mock) {
    await waitForMockDelay(authDelayMs)

    if (
      credentials.username !== mockLoginCredentials.username ||
      credentials.password !== mockLoginCredentials.password
    ) {
      throw new LoginError("invalidCredentials")
    }

    return createUserMockCopy()
  }

  try {
    const identity = authenticatedUserSchema.parse(
      await apiRequest<unknown>("/auth/login", {
        json: credentials,
        method: "POST",
      }),
    )
    const account = userAccountSchema.parse(await apiRequest<unknown>("/users/me"))
    if (account.id !== identity.id || account.username !== identity.username) {
      throw new Error("Authenticated identity does not match the current user account.")
    }

    return createUser(account)
  } catch (error) {
    throw mapLoginError(error)
  }
}

export async function logout(): Promise<void> {
  if (env.mock) {
    await waitForMockDelay(authDelayMs)
    return
  }

  await apiRequest<void>("/auth/logout", {
    method: "POST",
  })
}

export async function restoreCurrentUser(): Promise<User | null> {
  if (env.mock) {
    await waitForMockDelay(authDelayMs)
    return null
  }

  try {
    const account = userAccountSchema.parse(await apiRequest<unknown>("/users/me"))

    return createUser(account)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }

    throw error
  }
}

export async function getCurrentAuthUser(): Promise<AuthenticatedUser> {
  if (env.mock) {
    await waitForMockDelay(authDelayMs)
    const { id, username } = createUserMockCopy()

    return { id, username }
  }

  return authenticatedUserSchema.parse(await apiRequest<unknown>("/auth/me"))
}
