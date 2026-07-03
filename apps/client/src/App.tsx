import { useEffect, useState } from 'react'
import { AppShell } from './app/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { getCurrentUser, logout } from './services/auth.api'
import { clearSession, getStoredSession, saveSession } from './stores/session.store'
import type { AuthSession, User } from './types/auth'

type SessionState =
  | { status: 'checking' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' }

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'checking' })

  useEffect(() => {
    const storedSession = getStoredSession()

    if (!storedSession) {
      setSessionState({ status: 'unauthenticated' })
      return
    }

    getCurrentUser()
      .then(({ user }) => {
        saveSession({ ...storedSession, user })
        setSessionState({ status: 'authenticated', user })
      })
      .catch(() => {
        clearSession()
        setSessionState({ status: 'unauthenticated' })
      })
  }, [])

  function handleLogin(session: AuthSession) {
    saveSession(session)
    setSessionState({ status: 'authenticated', user: session.user })
  }

  async function handleLogout() {
    try {
      await logout()
    } finally {
      clearSession()
      setSessionState({ status: 'unauthenticated' })
    }
  }

  if (sessionState.status === 'checking') {
    return <main className="app-loading">正在恢复登录状态...</main>
  }

  if (sessionState.status === 'unauthenticated') {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <AppShell user={sessionState.user} onLogout={handleLogout}>
      <DashboardPage />
    </AppShell>
  )
}
