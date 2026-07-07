import { useMemo, useState, type ReactNode } from 'react'
import { clearSession, getStoredSession, saveSession } from '@/stores/session.store'
import type { AuthSession } from '@/types/auth'
import { SessionContext, type SessionContextValue } from './session-context'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession())

  const value = useMemo<SessionContextValue>(
    () => ({
      isAuthenticated: session !== null,
      login(nextSession) {
        saveSession(nextSession)
        setSession(nextSession)
      },
      logout() {
        clearSession()
        setSession(null)
      },
      session,
      user: session?.user ?? null,
    }),
    [session],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
