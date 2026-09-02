import { useCallback } from "react"

import * as authService from "@/services/auth"
import { useAuthStore } from "@/stores/auth"

export function useAuth() {
  const currentUser = useAuthStore((state) => state.currentUser)
  const clearCurrentUser = useAuthStore((state) => state.clearCurrentUser)
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser)
  const isAuthenticated = currentUser !== null

  async function login(input: authService.LoginCredentials) {
    const user = await authService.login(input)

    setCurrentUser(user)
    return user
  }

  async function logout() {
    await authService.logout()
    clearCurrentUser()
  }

  async function register(input: authService.RegisterCredentials) {
    const user = await authService.register(input)

    setCurrentUser(user)
    return user
  }

  const restoreCurrentUser = useCallback(async () => {
    const restoredUser = await authService.restoreCurrentUser()

    if (restoredUser) {
      setCurrentUser(restoredUser)
      return restoredUser
    }

    clearCurrentUser()
    return null
  }, [clearCurrentUser, setCurrentUser])

  return {
    currentUser,
    isAuthenticated,
    login,
    logout,
    register,
    restoreCurrentUser,
  }
}
