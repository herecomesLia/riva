import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import * as authService from "@/services/auth"
import { useAuthStore } from "@/stores/auth"

export function useAuth() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.currentUser)
  const clearCurrentUser = useAuthStore((state) => state.clearCurrentUser)
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser)
  const isAuthenticated = currentUser !== null

  const login = useCallback(
    async (input: authService.LoginCredentials) => {
      const user = await authService.login(input)

      queryClient.clear()
      setCurrentUser(user)
      return user
    },
    [queryClient, setCurrentUser],
  )

  const register = useCallback(
    async (input: authService.LoginCredentials) => {
      const user = await authService.register(input)

      queryClient.clear()
      setCurrentUser(user)
      return user
    },
    [queryClient, setCurrentUser],
  )

  const logout = useCallback(async () => {
    await authService.logout()
    queryClient.clear()
    clearCurrentUser()
  }, [clearCurrentUser, queryClient])

  const restoreCurrentUser = useCallback(async () => {
    const user = await authService.restoreCurrentUser()

    if (user) {
      if (useAuthStore.getState().currentUser?.id !== user.id) queryClient.clear()
      setCurrentUser(user)
      return user
    }

    queryClient.clear()
    clearCurrentUser()
    return null
  }, [clearCurrentUser, queryClient, setCurrentUser])

  return {
    currentUser,
    isAuthenticated,
    login,
    logout,
    register,
    restoreCurrentUser,
  }
}
