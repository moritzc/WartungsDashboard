import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/useAuthStore'
import { api } from '../../hooks/useApi'

export default function TopNav() {
  const { t, i18n } = useTranslation()
  const { user, setUser } = useAuthStore()

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // If server call fails, still clear client state
    }
    setUser(null)
    // No need to touch localStorage; persist was removed from the store.
    // App.tsx will show the login screen as soon as user===null.
  }

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language.startsWith('de') ? 'en' : 'de')
  }

  const initials = (user?.displayName ?? user?.username ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <header className="topnav">
      <div className="topnav__brand">
        <span className="material-symbols-outlined icon-lg" style={{ color: 'var(--color-primary)' }}>
          dns
        </span>
        WartungsDashboard
      </div>

      <div className="topnav__actions">
        {/* Language toggle */}
        <button className="topnav__icon-btn" onClick={toggleLang} title="Toggle language">
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
            {i18n.language.startsWith('de') ? 'DE' : 'EN'}
          </span>
        </button>

        {/* User chip */}
        <div className="topnav__user">
          <div className="topnav__user-avatar">{initials}</div>
          <span className="truncate" style={{ maxWidth: 120 }}>
            {user?.displayName ?? user?.username}
          </span>
          <button className="topnav__icon-btn" onClick={handleLogout} title={t('nav.signOut')}>
            <span className="material-symbols-outlined icon-sm">logout</span>
          </button>
        </div>
      </div>
    </header>
  )
}
