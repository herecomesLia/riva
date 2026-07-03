import type { ReactNode } from 'react'
import { SidebarNav } from '../widgets/app-shell/SidebarNav'
import { TopBar } from '../widgets/app-shell/TopBar'
import type { User } from '../types/auth'

type AppShellProps = {
  children: ReactNode
  onLogout: () => void
  user: User
}

export function AppShell({ children, onLogout, user }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳转到主要内容
      </a>
      <SidebarNav user={user} />
      <div className="app-shell__workspace">
        <TopBar user={user} onLogout={onLogout} />
        <main id="main-content" className="app-shell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
