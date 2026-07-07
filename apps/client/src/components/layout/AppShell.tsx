import { Outlet } from 'react-router'
import { useSession } from '@/app/session-context'
import { MobileNav } from '@/components/navigation/MobileNav'
import { Sidebar } from '@/components/navigation/Sidebar'
import { TopBar } from '@/components/navigation/TopBar'

export function AppShell() {
  const { logout, user } = useSession()

  if (!user) {
    return null
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳转到主要内容
      </a>
      <Sidebar user={user} />
      <div className="app-shell__workspace">
        <TopBar user={user} onLogout={logout} />
        <main id="main-content" className="app-shell__main" tabIndex={-1}>
          <Outlet />
        </main>
        <MobileNav />
      </div>
    </div>
  )
}
