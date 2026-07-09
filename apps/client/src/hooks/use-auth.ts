import * as authService from "@/services/auth"
import { useAuthStore } from "@/stores/auth"

export function useAuth() {
  const currentUser = useAuthStore((state) => state.currentUser)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const session = useAuthStore((state) => state.session)
  const clearAuthSession = useAuthStore((state) => state.clearAuthSession)
  const setAuthSession = useAuthStore((state) => state.setAuthSession)

  async function login(input: authService.SignInInput) {
    const result = await authService.login(input)

    setAuthSession(result.user, result.session)
    return result
  }

  async function logout() {
    await authService.logout()
    clearAuthSession()
  }

  async function restoreSession() {
    const result = await authService.restoreSession()

    if (result) {
      setAuthSession(result.user, result.session)
      return result
    }

    clearAuthSession()
    return null
  }

  return {
    currentUser,
    isAuthenticated,
    login,
    logout,
    restoreSession,
    session,
  }
}
