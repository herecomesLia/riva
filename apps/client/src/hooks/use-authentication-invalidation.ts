import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import { ApiError } from "@/services/api"
import { useAuthStore } from "@/stores/auth"

export function useAuthenticationInvalidation() {
  const queryClient = useQueryClient()
  const clearCurrentUser = useAuthStore((state) => state.clearCurrentUser)

  return useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 401) return false

      queryClient.clear()
      clearCurrentUser()
      return true
    },
    [clearCurrentUser, queryClient],
  )
}
