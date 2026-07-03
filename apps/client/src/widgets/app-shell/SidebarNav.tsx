import {
  HistoryIcon,
  HomeIcon,
  InterviewIcon,
  PracticeIcon,
  ProfileIcon,
  RoleIcon,
} from './icons'
import type { User } from '../../types/auth'

const navItems = [
  { label: '工作台', href: '#dashboard-title', icon: HomeIcon, active: true },
  { label: '求职档案', href: '#profile', icon: ProfileIcon },
  { label: '目标岗位', href: '#roles', icon: RoleIcon },
  { label: '专项练习', href: '#practice', icon: PracticeIcon },
  { label: '模拟面试', href: '#mock', icon: InterviewIcon },
  { label: '训练记录', href: '#history', icon: HistoryIcon },
]

type SidebarNavProps = {
  user: User
}

export function SidebarNav({ user }: SidebarNavProps) {
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

          return (
            <a
              aria-current={item.active ? 'page' : undefined}
              className={item.active ? 'nav-link nav-link--active' : 'nav-link'}
              href={item.href}
              key={item.label}
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
