import {
  HistoryIcon,
  HomeIcon,
  InterviewIcon,
  PracticeIcon,
  ProfileIcon,
  RoleIcon,
} from './icons'

const navItems = [
  { label: '工作台', href: '#dashboard-title', icon: HomeIcon, active: true },
  { label: '求职档案', href: '#profile', icon: ProfileIcon },
  { label: '目标岗位', href: '#roles', icon: RoleIcon },
  { label: '专项练习', href: '#practice', icon: PracticeIcon },
  { label: '模拟面试', href: '#mock', icon: InterviewIcon },
  { label: '训练记录', href: '#history', icon: HistoryIcon },
]

export function SidebarNav() {
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
        <p>本周目标</p>
        <strong>完成 6 道高价值题卡</strong>
        <div className="mini-progress" aria-label="本周目标完成 67%">
          <span style={{ width: '67%' }} />
        </div>
      </div>
    </aside>
  )
}
