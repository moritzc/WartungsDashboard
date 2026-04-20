import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/useAuthStore'

interface NavItem {
  to: string
  icon: string
  label: string
  adminOnly?: boolean
}

export default function SideNav() {
  const { t } = useTranslation()
  const isAdmin = useAuthStore((s) => s.isAdmin())

  const items: NavItem[] = [
    { to: '/dashboard', icon: 'dashboard', label: t('nav.maintenance') },
    { to: '/customers', icon: 'groups', label: t('nav.customers'), adminOnly: true },
    { to: '/configuration', icon: 'tune', label: t('nav.configuration'), adminOnly: true },
    { to: '/reporting', icon: 'analytics', label: t('nav.reporting') },
    { to: '/users', icon: 'manage_accounts', label: t('nav.users'), adminOnly: true },
  ]

  return (
    <nav className="sidenav">
      <div className="sidenav__scrollarea">
        <div className="sidenav__section-label">Navigation</div>
        <ul>
          {items.map((item) => {
            if (item.adminOnly && !isAdmin) return null
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `sidenav__nav-item${isActive ? ' sidenav__nav-item--active' : ''}`
                  }
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  {item.label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
