import { NavLink } from 'react-router'
import type { User } from '@/types/auth'
import { navigationItems } from './nav-items'

type SidebarProps = {
  user: User
}

export function Sidebar({ user }: SidebarProps) {
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
        {navigationItems.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}
              key={item.href}
              to={item.href}
            >
              <Icon className="nav-link__icon" />
              <span>{item.label}</span>
            </NavLink>
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
