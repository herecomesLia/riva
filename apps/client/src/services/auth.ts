import { env } from "@/app/env"
import { authSessionMock, authUserMock } from "@/mocks/data/auth"
import { waitForMockDelay } from "@/mocks/utils"
import type { AuthSession, AuthUser } from "@/models/auth"

export type SignInInput = {
  username: string
}

export type AuthSessionResult = {
  session: AuthSession
  user: AuthUser
}

const authDelayMs = 160

export async function login(_input: SignInInput): Promise<AuthSessionResult> {
  void _input

  if (env.mock) {
    await waitForMockDelay(authDelayMs)
    return {
      session: authSessionMock,
      user: authUserMock,
    }
  }

  throw new Error("Real login is not implemented.")
}

export async function logout() {
  if (env.mock) {
    await waitForMockDelay(authDelayMs)
    return
  }

  throw new Error("Real logout is not implemented.")
}

export async function restoreSession(): Promise<AuthSessionResult | null> {
  if (env.mock) {
    await waitForMockDelay(authDelayMs)
    return {
      session: authSessionMock,
      user: authUserMock,
    }
  }

  throw new Error("Real session restore is not implemented.")
}
