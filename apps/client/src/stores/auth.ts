import { create } from "zustand"

import type { User } from "@/models/auth"

type AuthState = {
  currentUser: User | null
  clearCurrentUser: () => void
  setCurrentUser: (user: User) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  clearCurrentUser: () => {
    set({
      currentUser: null,
    })
  },
  currentUser: null,
  setCurrentUser: (user) => {
    set({
      currentUser: user,
    })
  },
}))
