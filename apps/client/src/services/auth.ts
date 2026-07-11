import { env } from "@/app/env"
import { userMock } from "@/mocks/data/auth"
import { waitForMockDelay } from "@/mocks/utils"
import type { LoginCredentials, User } from "@/models/auth"

export type { LoginCredentials } from "@/models/auth"

const authDelayMs = 500

export async function login(_credentials: LoginCredentials): Promise<User> {
  if (env.mock) {
    await waitForMockDelay(authDelayMs)
    return userMock
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
