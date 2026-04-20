import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import { useAuthStore } from '../stores/useAuthStore'
import type { User } from '../types'

export default function Login() {
  const { t } = useTranslation()
  const setUser = useAuthStore((s) => s.setUser)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await api.post<User>('/auth/login', { username, password })
      setUser(user)
    } catch {
      setError(t('auth.invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="flex-center gap-2 mb-6">
          <span className="material-symbols-outlined icon-lg" style={{ color: 'var(--color-primary)' }}>
            dns
          </span>
          <div>
            <div className="login-card__logo">WartungsDashboard</div>
            <div className="login-card__subtitle">{t('auth.subtitle')}</div>
          </div>
        </div>

        {error && <div className="login-card__error mb-4">{error}</div>}

        <form className="login-card__form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="username">
              {t('auth.username')}
            </label>
            <input
              id="username"
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">
              {t('auth.password')}
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn btn--primary w-full" type="submit" disabled={loading}>
            {loading ? (
              <span className="spinner spinner--sm" />
            ) : (
              <span className="material-symbols-outlined icon-sm">login</span>
            )}
            {t('auth.login')}
          </button>
        </form>
      </div>
    </div>
  )
}
