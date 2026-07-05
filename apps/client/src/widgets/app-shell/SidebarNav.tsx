import {
  HistoryIcon,
  HomeIcon,
  InterviewIcon,
  PracticeIcon,
  ProfileIcon,
  RoleIcon,
} from './icons'
import type { ComponentType } from 'react'
import type { User } from '../../types/auth'
import type { AppPage } from '../../types/navigation'

const navItems = [
  { label: '工作台', href: '#dashboard-title', icon: HomeIcon, page: 'dashboard' },
  { label: '求职档案', href: '#resume-profile-title', icon: ProfileIcon, page: 'resume-profile' },
  { label: '目标岗位', href: '#roles', icon: RoleIcon },
  { label: '专项练习', href: '#practice', icon: PracticeIcon },
  { label: '模拟面试', href: '#mock', icon: InterviewIcon },
  { label: '训练记录', href: '#history', icon: HistoryIcon },
] satisfies Array<{
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  page?: AppPage
}>

type SidebarNavProps = {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
  user: User
}

export function SidebarNav({ currentPage, onNavigate, user }: SidebarNavProps) {
  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="brand" aria-label="Riva">
        <span className="brand__mark" aria-hidden="true">
          R
        </span>
        <div>
          <strong>Riva</strong>
          <span>AI 面试训练</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = item.page === currentPage

          return (
            <a
              aria-current={active ? 'page' : undefined}
              className={active ? 'nav-link nav-link--active' : 'nav-link'}
              href={item.href}
              key={item.label}
              onClick={(event) => {
                if (!item.page) {
                  return
                }

                event.preventDefault()
                onNavigate(item.page)
              }}
            >
              <Icon className="nav-link__icon" />
              <span>{item.label}</span>
            </a>
          )
        })}
      </nav>

      <div className="sidebar__footer">
        <p>{user.role}</p>
        <strong>{user.currentTargetRole ?? '暂未设置目标岗位'}</strong>
      </div>
    </aside>
  )
}
