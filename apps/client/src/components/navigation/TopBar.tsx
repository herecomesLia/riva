import { BellIcon, SearchIcon } from './icons'
import type { User } from '@/types/auth'

type TopBarProps = {
  onLogout: () => void
  user: User
}

export function TopBar({ onLogout, user }: TopBarProps) {
  return (
    <header className="topbar">
      <label className="search-field">
        <SearchIcon className="search-field__icon" />
        <span className="sr-only">搜索题卡、岗位或训练记录</span>
        <input type="search" placeholder="搜索题卡、岗位或训练记录" />
      </label>

      <div className="topbar__actions">
        <button className="icon-button" type="button" aria-label="查看通知">
          <BellIcon className="icon-button__icon" />
        </button>
        <button className="language-button" type="button" aria-label="切换语言">
          {user.locale}
        </button>
        <button className="user-button" type="button" aria-label="打开用户菜单">
          <span aria-hidden="true">{user.avatarInitial}</span>
          <span>{user.name}</span>
        </button>
        <button className="button button--ghost button--small" type="button" onClick={onLogout}>
          退出
        </button>
      </div>
    </header>
  )
}
