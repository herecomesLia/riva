import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { UserResponse } from "@/api/generated/models"
import * as authService from "@/services/auth"

export const CURRENT_USER_QUERY_KEY = ["auth", "current-user"] as const

export function useAuth() {
  const queryClient = useQueryClient()
  const currentUserQuery = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: ({ signal }) => authService.getCurrentUser(signal),
    retry: false,
    staleTime: Infinity,
  })
  const currentUser = currentUserQuery.data ?? null
  const isAuthenticated = currentUser !== null

  async function resetSession(user: UserResponse | null) {
    await queryClient.cancelQueries()
    const authQuery = queryClient.getQueryCache().find({
      queryKey: CURRENT_USER_QUERY_KEY,
      exact: true,
    })
    queryClient.removeQueries({ predicate: (query) => query !== authQuery })
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user)
  }

  async function login(input: authService.LoginCredentials) {
    const user = await authService.login(input)

    await resetSession(user)
    return user
  }

  async function logout() {
    await authService.logout()
    await resetSession(null)
  }

  async function register(input: authService.RegisterCredentials) {
    const user = await authService.register(input)

    await resetSession(user)
    return user
  }

  async function retry() {
    await currentUserQuery.refetch()
  }

  return {
    currentUser,
    isAuthenticated,
    isError: currentUserQuery.isError,
    isPending: currentUserQuery.isPending,
    login,
    logout,
    register,
    retry,
  }
}
