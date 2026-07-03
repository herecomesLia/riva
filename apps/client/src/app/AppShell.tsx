import type { ReactNode } from 'react'
import { SidebarNav } from '../widgets/app-shell/SidebarNav'
import { TopBar } from '../widgets/app-shell/TopBar'

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳转到主要内容
      </a>
      <SidebarNav />
      <div className="app-shell__workspace">
        <TopBar />
        <main id="main-content" className="app-shell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
