import type { LoginCredentials, RegisterCredentials, UserResponse } from "@/api/generated/models"
import { authCredentialsFixture, authUserFixture } from "@/mocks/fixtures/auth"

type Account = {
  credentials: LoginCredentials
  user: UserResponse
}

type RegisterResult = { ok: true; user: UserResponse } | { ok: false; reason: "usernameTaken" }

function createInitialAccounts(): Account[] {
  return [
    {
      credentials: { ...authCredentialsFixture },
      user: { ...authUserFixture },
    },
  ]
}

export function createAuthFaker() {
  let accounts = createInitialAccounts()
  let currentUser: UserResponse | null = null

  function findAccount(username: string): Account | undefined {
    const normalizedUsername = username.toLowerCase()
    return accounts.find(
      (account) => account.credentials.username.toLowerCase() === normalizedUsername,
    )
  }

  return {
    getCurrentUser(): UserResponse | null {
      return currentUser ? { ...currentUser } : null
    },
    login(credentials: LoginCredentials): UserResponse | null {
      const account = findAccount(credentials.username)
      if (!account || account.credentials.password !== credentials.password) return null

      currentUser = { ...account.user }
      return { ...currentUser }
    },
    logout(): void {
      currentUser = null
    },
    register(credentials: RegisterCredentials): RegisterResult {
      if (findAccount(credentials.username)) return { ok: false, reason: "usernameTaken" }

      const user: UserResponse = {
        avatarUrl: null,
        displayName: credentials.username,
        id: `00000000-0000-4000-8000-${String(accounts.length).padStart(12, "0")}`,
        username: credentials.username,
      }
      accounts.push({
        credentials: { ...credentials },
        user,
      })
      currentUser = { ...user }
      return { ok: true, user: { ...user } }
    },
    reset(): void {
      accounts = createInitialAccounts()
      currentUser = null
    },
  }
}

export const authFaker = createAuthFaker()
