import type { ReactNode } from 'react'
import { SidebarNav } from '../widgets/app-shell/SidebarNav'
import { TopBar } from '../widgets/app-shell/TopBar'
import type { User } from '../types/auth'
import type { AppPage } from '../types/navigation'

type AppShellProps = {
  children: ReactNode
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
  onLogout: () => void
  user: User
}

export function AppShell({ children, currentPage, onLogout, onNavigate, user }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳转到主要内容
      </a>
      <SidebarNav currentPage={currentPage} user={user} onNavigate={onNavigate} />
      <div className="app-shell__workspace">
        <TopBar user={user} onLogout={onLogout} />
        <main id="main-content" className="app-shell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
