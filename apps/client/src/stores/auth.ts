import { create } from "zustand"

import type { AuthSession, AuthUser } from "@/models/auth"

type AuthState = {
  currentUser: AuthUser | null
  isAuthenticated: boolean
  session: AuthSession | null
  clearAuthSession: () => void
  setAuthSession: (user: AuthUser, session: AuthSession) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  clearAuthSession: () => {
    set({
      currentUser: null,
      isAuthenticated: false,
      session: null,
    })
  },
  currentUser: null,
  isAuthenticated: false,
  session: null,
  setAuthSession: (user, session) => {
    set({
      currentUser: user,
      isAuthenticated: true,
      session,
    })
  },
}))
