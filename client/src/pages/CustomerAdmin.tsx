import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import { useAuthStore } from '../stores/useAuthStore'
import type { Customer, Device, DeviceCategory } from '../types'

const CATEGORIES: DeviceCategory[] = ['SERVER', 'NAS', 'FIREWALL', 'UPS', 'CUSTOM']

// ─── Customer Modal ───────────────────────────────────────────────────────────
function CustomerModal({
  customer,
  onClose,
  onSave,
}: {
  customer: Customer | null
  onClose: () => void
  onSave: (c: Customer) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(customer?.name ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const result = customer
        ? await api.put<Customer>(`/customers/${customer.id}`, { name, notes })
        : await api.post<Customer>('/customers', { name, notes })
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
          <div className="drawer__title">
            {customer ? t('customers.edit') : t('customers.add')}
          </div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="drawer__body">
            <div className="field mb-4">
              <label className="field__label">{t('customers.customerName')}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label className="field__label">{t('common.notes')}</label>
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
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

// ─── Device Modal ─────────────────────────────────────────────────────────────
function DeviceModal({
  device,
  customerId,
  globalFields,
  onClose,
  onSave,
}: {
  device: Device | null
  customerId: string
  globalFields: CustomFieldDef[]
  onClose: () => void
  onSave: (d: Device) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(device?.name ?? '')
  const [hostname, setHostname] = useState(device?.hostname ?? '')
  const [category, setCategory] = useState<DeviceCategory>(device?.category ?? 'SERVER')
  const [sortOrder, setSortOrder] = useState(device?.sortOrder ?? 0)
  const [notes, setNotes] = useState(device?.notes ?? '')
  const [customFieldIds, setCustomFieldIds] = useState<string[]>(
    device?.customFields?.map((f) => f.id) ?? []
  )
  const [saving, setSaving] = useState(false)

  const availableFields = globalFields.filter((f) => !f.category || f.category === category)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { name, hostname, category, sortOrder, notes, customFieldIds }
      const result = device
        ? await api.put<Device>(`/devices/${device.id}`, payload)
        : await api.post<Device>('/devices', { customerId, ...payload })
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
          <div className="drawer__title">
            {device ? t('customers.editDevice') : t('customers.addDevice')}
          </div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="drawer__body">
            <div className="grid-2" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div className="field">
                <label className="field__label">{t('customers.deviceName')}</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              <div className="field">
                <label className="field__label">{t('customers.hostname')}</label>
                <input className="input" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="srv01.domain.local" />
              </div>
              <div className="field">
                <label className="field__label">{t('customers.category')}</label>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value as DeviceCategory)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t(`customers.categories.${c}` as Parameters<typeof t>[0])}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label">{t('customers.sortOrder')}</label>
                <input className="input" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
              </div>
            </div>
            {availableFields.length > 0 && (
              <div className="card mb-4" style={{ padding: 'var(--space-3)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
                  {t('config.customFields')}
                </div>
                <div className="flex flex-col gap-2">
                  {availableFields.map((f) => (
                    <label key={f.id} className="checkbox-row" style={{ alignItems: 'flex-start' }}>
                      <input
                        type="checkbox"
                        checked={customFieldIds.includes(f.id)}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setCustomFieldIds((prev) => checked ? [...prev, f.id] : prev.filter((id) => id !== f.id))
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 500 }}>{f.name} {f.unit ? `(${f.unit})` : ''}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-on-surface-muted)' }}>
                          {t(`config.dataTypes.${f.dataType}` as Parameters<typeof t>[0])}
                          {f.isRequired ? ' · Required' : ''}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <label className="field__label">{t('common.notes')}</label>
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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

// ─── Main CustomerAdmin Page ──────────────────────────────────────────────────
export default function CustomerAdmin() {
  const { t } = useTranslation()
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const [customers, setCustomers] = useState<Customer[]>([])
  const [globalFields, setGlobalFields] = useState<CustomFieldDef[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  const [customerModal, setCustomerModal] = useState<'new' | Customer | null>(null)
  const [deviceModal, setDeviceModal] = useState<'new' | Device | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Customer[]>('/customers'),
      api.get<CustomFieldDef[]>('/config/custom-fields')
    ])
      .then(([custData, fieldsData]) => {
        setCustomers(custData)
        setGlobalFields(fieldsData)
        if (custData.length > 0) setSelectedCustomer(custData[0])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedCustomer) return
    api.get<Customer>(`/customers/${selectedCustomer.id}`).then((c) => setDevices(c.devices ?? []))
  }, [selectedCustomer])

  const deleteCustomer = async (c: Customer) => {
    if (!confirm(t('customers.deleteConfirm', { name: c.name }))) return
    await api.delete(`/customers/${c.id}`)
    const updated = customers.filter((x) => x.id !== c.id)
    setCustomers(updated)
    setSelectedCustomer(updated[0] ?? null)
  }

  const deleteDevice = async (d: Device) => {
    if (!confirm(t('customers.deleteConfirm', { name: d.name }))) return
    await api.delete(`/devices/${d.id}`)
    setDevices((prev) => prev.filter((x) => x.id !== d.id))
  }

  if (loading) return <div className="page loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('customers.title')}</h1>
        </div>
        {isAdmin && (
          <div className="page-header__actions">
            <button className="btn btn--primary" onClick={() => setCustomerModal('new')}>
              <span className="material-symbols-outlined icon-sm">add</span>
              {t('customers.add')}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-6)' }}>
        {/* Customer list */}
        <div>
          {customers.length === 0 ? (
            <div className="empty-state"><p>{t('customers.noCustomers')}</p></div>
          ) : (
            <ul>
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    className={`sidenav__nav-item${selectedCustomer?.id === c.id ? ' sidenav__nav-item--active' : ''}`}
                    style={{ width: '100%', borderLeft: '4px solid transparent' }}
                    onClick={() => setSelectedCustomer(c)}
                  >
                    <span className="material-symbols-outlined icon-sm">business</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    {isAdmin && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setCustomerModal(c)}>
                          <span className="material-symbols-outlined icon-sm">edit</span>
                        </button>
                        <button className="btn btn--ghost btn--icon btn--sm" style={{ color: 'var(--color-error)' }} onClick={() => deleteCustomer(c)}>
                          <span className="material-symbols-outlined icon-sm">delete</span>
                        </button>
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Device list */}
        {selectedCustomer && (
          <div>
            <div className="flex-between mb-4">
              <h2 className="section-title">
                <span className="material-symbols-outlined">devices</span>
                {selectedCustomer.name} — {t('customers.devices')}
              </h2>
              {isAdmin && (
                <button className="btn btn--secondary btn--sm" onClick={() => setDeviceModal('new')}>
                  <span className="material-symbols-outlined icon-sm">add</span>
                  {t('customers.addDevice')}
                </button>
              )}
            </div>

            {devices.length === 0 ? (
              <div className="empty-state"><p>{t('sheet.noDevices')}</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('customers.hostname')}</th>
                    <th>{t('customers.category')}</th>
                    <th>{t('common.status')}</th>
                    {isAdmin && <th className="text-right">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 500 }}>{d.name}</td>
                      <td className="text-muted">{d.hostname ?? '—'}</td>
                      <td>
                        <span className="badge badge--neutral">
                          {t(`customers.categories.${d.category}` as Parameters<typeof t>[0])}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${d.isActive ? 'badge--ok' : 'badge--neutral'}`}>
                          {d.isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="text-right">
                          <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setDeviceModal(d)}>
                              <span className="material-symbols-outlined icon-sm">edit</span>
                            </button>
                            <button className="btn btn--ghost btn--icon btn--sm" style={{ color: 'var(--color-error)' }} onClick={() => deleteDevice(d)}>
                              <span className="material-symbols-outlined icon-sm">delete</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {customerModal && (
        <CustomerModal
          customer={customerModal === 'new' ? null : customerModal}
          onClose={() => setCustomerModal(null)}
          onSave={(c) => {
            setCustomers((prev) => {
              const exists = prev.find((x) => x.id === c.id)
              return exists ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c]
            })
            setSelectedCustomer(c)
            setCustomerModal(null)
          }}
        />
      )}

      {deviceModal && selectedCustomer && (
        <DeviceModal
          device={deviceModal === 'new' ? null : deviceModal}
          customerId={selectedCustomer.id}
          globalFields={globalFields}
          onClose={() => setDeviceModal(null)}
          onSave={(d) => {
            setDevices((prev) => {
              const exists = prev.find((x) => x.id === d.id)
              return exists ? prev.map((x) => (x.id === d.id ? d : x)) : [...prev, d]
            })
            setDeviceModal(null)
          }}
        />
      )}
    </div>
  )
}
