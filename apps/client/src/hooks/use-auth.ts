import { useQueryClient } from "@tanstack/react-query"

import * as authService from "@/services/auth"
import { useAuthStore } from "@/stores/auth"

export function useAuth() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.currentUser)
  const clearCurrentUser = useAuthStore((state) => state.clearCurrentUser)
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser)
  const isAuthenticated = currentUser !== null

  async function login(input: authService.LoginCredentials) {
    const user = await authService.login(input)

    queryClient.clear()
    setCurrentUser(user)
    return user
  }

  async function logout() {
    await authService.logout()
    queryClient.clear()
    clearCurrentUser()
  }

  async function restoreCurrentUser() {
    const user = await authService.restoreCurrentUser()

    if (user) {
      if (currentUser?.id !== user.id) queryClient.clear()
      setCurrentUser(user)
      return user
    }

    queryClient.clear()
    clearCurrentUser()
    return null
  }

  return {
    currentUser,
    isAuthenticated,
    login,
    logout,
    restoreCurrentUser,
  }
}
