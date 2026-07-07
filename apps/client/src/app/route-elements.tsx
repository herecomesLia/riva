import { Navigate, useLocation, useNavigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { ResumeProfilePage } from '@/pages/ResumeProfilePage'
import { ResumeSetupPage } from '@/pages/ResumeSetupPage'
import { useSession } from './session-context'

export function RootRedirect() {
  const { isAuthenticated } = useSession()

  return <Navigate to={isAuthenticated ? '/dashboard' : '/auth/login'} replace />
}

export function AuthLayout() {
  const { isAuthenticated, login } = useSession()
  const navigate = useNavigate()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <LoginPage
      onLogin={(session) => {
        login(session)
        navigate('/dashboard', { replace: true })
      }}
    />
  )
}

export function ProtectedLayout() {
  const { isAuthenticated } = useSession()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace state={{ from: location }} />
  }

  return <AppShell />
}

export function ResumeProfileRoute() {
  const navigate = useNavigate()

  return <ResumeProfilePage onSetupResume={() => navigate('/resume/setup')} />
}

export function ResumeSetupRoute() {
  const navigate = useNavigate()

  return <ResumeSetupPage onOpenProfile={() => navigate('/resume/profile')} />
}
