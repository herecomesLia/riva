import { create } from "zustand"

export type AuthUser = {
  id: string
  username: string
  displayName: string
  avatarUrl?: string
  avatarFallback: string
}

export type AuthSession = {
  id: string
  signedInAt: string
}

type AuthState = {
  currentUser: AuthUser | null
  isAuthenticated: boolean
  session: AuthSession | null
  signIn: (username: string) => void
  signOut: () => void
}

function normalizeUsername(username: string) {
  return username.trim() || "user"
}

function createAvatarFallback(username: string) {
  return username.slice(0, 2).toUpperCase() || "U"
}

function createSessionId(username: string) {
  return `local:${username}:${Date.now().toString(36)}`
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isAuthenticated: false,
  session: null,
  signIn: (username) => {
    const normalizedUsername = normalizeUsername(username)

    set({
      currentUser: {
        avatarFallback: createAvatarFallback(normalizedUsername),
        displayName: normalizedUsername,
        id: `local:${normalizedUsername.toLowerCase()}`,
        username: normalizedUsername,
      },
      isAuthenticated: true,
      session: {
        id: createSessionId(normalizedUsername),
        signedInAt: new Date().toISOString(),
      },
    })
  },
  signOut: () => {
    set({
      currentUser: null,
      isAuthenticated: false,
      session: null,
    })
  },
}))
