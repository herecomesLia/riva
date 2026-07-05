import { useEffect, useState } from 'react'
import { AppShell } from './app/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ResumeProfilePage } from './pages/ResumeProfilePage'
import { ResumeSetupPage } from './pages/ResumeSetupPage'
import { getCurrentUser, logout } from './services/auth.service'
import { clearSession, getStoredSession, saveSession } from './stores/session.store'
import type { AuthSession, User } from './types/auth'
import type { AppPage } from './types/navigation'

type SessionState =
  | { status: 'checking' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' }

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'checking' })
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard')

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
    setCurrentPage('dashboard')
    setSessionState({ status: 'authenticated', user: session.user })
  }

  async function handleLogout() {
    try {
      await logout()
    } finally {
      clearSession()
      setCurrentPage('dashboard')
      setSessionState({ status: 'unauthenticated' })
    }
  }

  if (sessionState.status === 'checking') {
    return <main className="app-loading">正在恢复登录状态...</main>
  }

  if (sessionState.status === 'unauthenticated') {
    return <LoginPage onLogin={handleLogin} />
  }

  const page = {
    dashboard: <DashboardPage />,
    'resume-profile': <ResumeProfilePage onSetupResume={() => setCurrentPage('resume-setup')} />,
    'resume-setup': <ResumeSetupPage onOpenProfile={() => setCurrentPage('resume-profile')} />,
  }[currentPage]

  return (
    <AppShell currentPage={currentPage} user={sessionState.user} onLogout={handleLogout} onNavigate={setCurrentPage}>
      {page}
    </AppShell>
  )
}
