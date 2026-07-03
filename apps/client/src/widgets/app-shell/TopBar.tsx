import { BellIcon, SearchIcon } from './icons'

export function TopBar() {
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
          zh-CN
        </button>
        <button className="user-button" type="button" aria-label="打开用户菜单">
          <span aria-hidden="true">L</span>
          <span>Liang</span>
        </button>
      </div>
    </header>
  )
}
