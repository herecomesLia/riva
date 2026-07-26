import { env } from "@/app/env"
import { mockLoginCredentials, userMock } from "@/mocks/data/auth"
import { waitForMockDelay } from "@/mocks/utils"
import { LoginError, type LoginCredentials, type User } from "@/models/auth"

export type { LoginCredentials, LoginErrorCode } from "@/models/auth"
export { LoginError, isLoginError } from "@/models/auth"

const authDelayMs = 500

function createUserMockCopy(): User {
  return { ...userMock }
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

  throw new Error("Real auth API is not implemented.")
}

export async function logout(): Promise<void> {
  if (env.mock) {
    await waitForMockDelay(authDelayMs)
    return
  }

  throw new Error("Real auth API is not implemented.")
}

export async function restoreCurrentUser(): Promise<User | null> {
  if (env.mock) {
    await waitForMockDelay(authDelayMs)
    return null
  }

  throw new Error("Real auth API is not implemented.")
}
