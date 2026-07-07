import { createContext, useContext } from 'react'
import type { AuthSession, User } from '@/types/auth'

export type SessionContextValue = {
  isAuthenticated: boolean
  login: (session: AuthSession) => void
  logout: () => void
  session: AuthSession | null
  user: User | null
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession() {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }

  return context
}
