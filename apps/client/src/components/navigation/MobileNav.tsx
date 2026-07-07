import { NavLink } from 'react-router'
import { navigationItems } from './nav-items'

export function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="移动端主导航">
      {navigationItems.slice(0, 5).map((item) => {
        const Icon = item.icon

        return (
          <NavLink
            className={({ isActive }) => (isActive ? 'mobile-nav__link mobile-nav__link--active' : 'mobile-nav__link')}
            key={item.href}
            to={item.href}
          >
            <Icon className="mobile-nav__icon" />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
