import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import { useAuthStore } from '../stores/useAuthStore'
import type { User } from '../types'

function UserModal({
  user,
  onClose,
  onSave,
}: {
  user: User | null
  onClose: () => void
  onSave: (u: User) => void
}) {
  const { t } = useTranslation()
  const [username, setUsername] = useState(user?.username ?? '')
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [role, setRole] = useState(user?.role ?? 'VIEWER')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body: Record<string, unknown> = { displayName, role }
      if (!user) { body.username = username; body.password = password }
      else if (password) body.password = password

      const result = user
        ? await api.put<User>(`/users/${user.id}`, body)
        : await api.post<User>('/users', body)
      onSave(result)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer__header">
          <div className="drawer__title">{user ? t('users.edit') : t('users.add')}</div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="drawer__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {!user && (
              <div className="field">
                <label className="field__label">{t('users.username')}</label>
                <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
              </div>
            )}
            <div className="field">
              <label className="field__label">{t('users.displayName')}</label>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="field">
              <label className="field__label">{t('users.role')}</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'VIEWER')}>
                <option value="VIEWER">{t('users.roles.VIEWER')}</option>
                <option value="ADMIN">{t('users.roles.ADMIN')}</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label">
                {user ? t('users.newPassword') : t('users.password')}
                {user && <span className="text-muted"> (leave blank to keep)</span>}
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!user}
                minLength={6}
              />
            </div>
          </div>
          <div className="drawer__footer flex gap-2">
            <button type="button" className="btn btn--ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn--primary flex-1" disabled={saving}>
              {saving ? <span className="spinner spinner--sm" /> : null}
              {t('common.save')}
            </button>
          </div>
        </form>
      </aside>
    </>
  )
}

export default function UserManagement() {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<User | 'new' | null>(null)

  useEffect(() => {
    api.get<User[]>('/users').then(setUsers).finally(() => setLoading(false))
  }, [])

  const deleteUser = async (u: User) => {
    if (u.id === currentUser?.id) { alert(t('users.cannotDeleteSelf')); return }
    if (!confirm(t('users.deleteConfirm', { username: u.username }))) return
    await api.delete(`/users/${u.id}`)
    setUsers((prev) => prev.filter((x) => x.id !== u.id))
  }

  if (loading) return <div className="page loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('users.title')}</h1>
        </div>
        <div className="page-header__actions">
          <button className="btn btn--primary" onClick={() => setModal('new')}>
            <span className="material-symbols-outlined icon-sm">person_add</span>
            {t('users.add')}
          </button>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">manage_accounts</span>
          <p>{t('users.noUsers')}</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('users.username')}</th>
              <th>{t('users.displayName')}</th>
              <th>{t('users.role')}</th>
              <th>{t('common.status')}</th>
              <th className="text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500 }}>
                  {u.username}
                  {u.id === currentUser?.id && (
                    <span className="badge badge--info" style={{ marginLeft: 8 }}>You</span>
                  )}
                </td>
                <td>{u.displayName ?? '—'}</td>
                <td>
                  <span className={`badge ${u.role === 'ADMIN' ? 'badge--info' : 'badge--neutral'}`}>
                    {t(`users.roles.${u.role}` as Parameters<typeof t>[0])}
                  </span>
                </td>
                <td>
                  <span className={`badge ${u.isActive ? 'badge--ok' : 'badge--neutral'}`}>
                    {u.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </td>
                <td className="text-right">
                  <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setModal(u)}>
                      <span className="material-symbols-outlined icon-sm">edit</span>
                    </button>
                    <button
                      className="btn btn--ghost btn--icon btn--sm"
                      style={{ color: u.id === currentUser?.id ? 'var(--color-outline)' : 'var(--color-error)' }}
                      onClick={() => deleteUser(u)}
                      disabled={u.id === currentUser?.id}
                    >
                      <span className="material-symbols-outlined icon-sm">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <UserModal
          user={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={(u) => {
            setUsers((prev) => {
              const exists = prev.find((x) => x.id === u.id)
              return exists ? prev.map((x) => (x.id === u.id ? u : x)) : [...prev, u]
            })
            setModal(null)
          }}
        />
      )}
    </div>
  )
}
