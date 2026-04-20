import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import { useAuthStore } from '../stores/useAuthStore'
import type { Customer, Device, DeviceCategory, CustomFieldDef, ThresholdOverride, GlobalThreshold } from '../types'

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
  const [isActive, setIsActive] = useState(customer?.isActive ?? true)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const result = customer
        ? await api.put<Customer>(`/customers/${customer.id}`, { name, notes, isActive })
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
            <div className="field mb-4">
              <label className="field__label">{t('common.notes')}</label>
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            {customer && (
              <label className="checkbox-row">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <div>
                  <div style={{ fontWeight: 500 }}>{t('common.active')}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-on-surface-muted)' }}>
                    Inactive customers are hidden from the dashboard
                  </div>
                </div>
              </label>
            )}
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

// ─── Threshold Override Panel ─────────────────────────────────────────────────
function ThresholdPanel({ deviceId, globalThresholds }: { deviceId: string; globalThresholds: GlobalThreshold[] }) {
  const [overrides, setOverrides] = useState<ThresholdOverride[]>([])
  const [saving, setSaving] = useState(false)
  const [edits, setEdits] = useState<Record<string, Partial<ThresholdOverride>>>({})

  useEffect(() => {
    api.get<ThresholdOverride[]>(`/config/overrides?deviceId=${deviceId}`).then((data) => {
      setOverrides(data)
      const e: Record<string, Partial<ThresholdOverride>> = {}
      data.forEach((o) => { e[o.field] = { ...o } })
      setEdits(e)
    })
  }, [deviceId])

  const trackedFields = ['diskFreeGB', 'lastUpdateDate']

  const getEdit = (field: string): Partial<ThresholdOverride> =>
    edits[field] ?? {}

  const setEditField = (field: string, key: keyof ThresholdOverride, val: number | null) => {
    setEdits((prev) => ({ ...prev, [field]: { ...prev[field], field, [key]: val } }))
  }

  const saveField = async (field: string) => {
    const edit = edits[field]
    if (!edit) return
    setSaving(true)
    try {
      const payload: Record<string, number | null | string> = { field, deviceId }
      // Include all threshold fields, use null for empty
      const isDate = field === 'lastUpdateDate'
      if (isDate) {
        payload.warnOlderThanDays = edit.warnOlderThanDays ?? null
        payload.errorOlderThanDays = edit.errorOlderThanDays ?? null
      } else {
        payload.warnBelow = edit.warnBelow ?? null
        payload.errorBelow = edit.errorBelow ?? null
        payload.warnAbove = edit.warnAbove ?? null
        payload.errorAbove = edit.errorAbove ?? null
      }

      const existing = overrides.find((o) => o.field === field)
      if (existing) {
        const updated = await api.put<ThresholdOverride>(`/config/overrides/${existing.id}`, payload)
        setOverrides((prev) => prev.map((o) => (o.id === existing.id ? updated : o)))
      } else {
        const created = await api.post<ThresholdOverride>('/config/overrides', payload)
        setOverrides((prev) => [...prev, created])
      }
    } finally {
      setSaving(false)
    }
  }

  const clearField = async (field: string) => {
    const existing = overrides.find((o) => o.field === field)
    if (existing) {
      await api.delete(`/config/overrides/${existing.id}`)
      setOverrides((prev) => prev.filter((o) => o.id !== existing.id))
    }
    setEdits((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
        Threshold Overrides
      </div>
      <div className="info-banner mb-3" style={{ fontSize: 11 }}>
        <span className="material-symbols-outlined icon-sm">info</span>
        <span>Overrides take priority over global defaults. Leave blank to use global values.</span>
      </div>
      {trackedFields.map((field) => {
        const isDate = field === 'lastUpdateDate'
        const e = getEdit(field)
        const hasOverride = overrides.some((o) => o.field === field)
        const global = globalThresholds.find((g) => g.field === field)

        return (
          <div key={field} className="card mb-3" style={{
            borderLeft: `3px solid ${hasOverride ? 'var(--color-warning)' : 'var(--color-outline)'}`,
            padding: 'var(--space-3)',
          }}>
            <div className="flex-between mb-2">
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {field === 'diskFreeGB' ? 'Disk Free (GB)' : 'Last Update (days)'}
                {hasOverride && (
                  <span className="badge badge--warning" style={{ marginLeft: 8, fontSize: 10 }}>Override active</span>
                )}
              </div>
              <div className="flex gap-1">
                {hasOverride && (
                  <button className="btn btn--ghost btn--sm" style={{ color: 'var(--color-error)', fontSize: 11 }} onClick={() => clearField(field)}>
                    Clear
                  </button>
                )}
                <button className="btn btn--secondary btn--sm" onClick={() => saveField(field)} disabled={saving}>
                  {saving ? <span className="spinner spinner--sm" /> : null}
                  Save
                </button>
              </div>
            </div>

            {isDate ? (
              <div className="grid-2" style={{ gap: 8 }}>
                <div className="field">
                  <label className="field__label" style={{ fontSize: 11 }}>
                    Warn older than (days)
                    {global?.warnOlderThanDays != null && (
                      <span className="text-muted" style={{ fontSize: 10 }}> (global: {global.warnOlderThanDays})</span>
                    )}
                  </label>
                  <input className="input" type="number" value={e.warnOlderThanDays ?? ''}
                    onChange={(ev) => setEditField(field, 'warnOlderThanDays', ev.target.value === '' ? null : Number(ev.target.value))}
                    placeholder="—"
                  />
                </div>
                <div className="field">
                  <label className="field__label" style={{ fontSize: 11 }}>
                    Error older than (days)
                    {global?.errorOlderThanDays != null && (
                      <span className="text-muted" style={{ fontSize: 10 }}> (global: {global.errorOlderThanDays})</span>
                    )}
                  </label>
                  <input className="input" type="number" value={e.errorOlderThanDays ?? ''}
                    onChange={(ev) => setEditField(field, 'errorOlderThanDays', ev.target.value === '' ? null : Number(ev.target.value))}
                    placeholder="—"
                  />
                </div>
              </div>
            ) : (
              <div className="grid-2" style={{ gap: 8 }}>
                <div className="field">
                  <label className="field__label" style={{ fontSize: 11 }}>
                    Warn below (GB)
                    {global?.warnBelow != null && (
                      <span className="text-muted" style={{ fontSize: 10 }}> (global: {global.warnBelow})</span>
                    )}
                  </label>
                  <input className="input" type="number" value={e.warnBelow ?? ''}
                    onChange={(ev) => setEditField(field, 'warnBelow', ev.target.value === '' ? null : Number(ev.target.value))}
                    placeholder="—"
                  />
                </div>
                <div className="field">
                  <label className="field__label" style={{ fontSize: 11 }}>
                    Error below (GB)
                    {global?.errorBelow != null && (
                      <span className="text-muted" style={{ fontSize: 10 }}> (global: {global.errorBelow})</span>
                    )}
                  </label>
                  <input className="input" type="number" value={e.errorBelow ?? ''}
                    onChange={(ev) => setEditField(field, 'errorBelow', ev.target.value === '' ? null : Number(ev.target.value))}
                    placeholder="—"
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Device Modal ─────────────────────────────────────────────────────────────
function DeviceModal({
  device,
  customerId,
  globalFields,
  globalThresholds,
  onClose,
  onSave,
}: {
  device: Device | null
  customerId: string
  globalFields: CustomFieldDef[]
  globalThresholds: GlobalThreshold[]
  onClose: () => void
  onSave: (d: Device) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(device?.name ?? '')
  const [hostname, setHostname] = useState(device?.hostname ?? '')
  const [category, setCategory] = useState<DeviceCategory>(device?.category ?? 'SERVER')
  const [sortOrder, setSortOrder] = useState(device?.sortOrder ?? 0)
  const [notes, setNotes] = useState(device?.notes ?? '')
  const [isActive, setIsActive] = useState(device?.isActive ?? true)
  const [activeSince, setActiveSince] = useState(device?.activeSince ?? '')
  const [activeUntil, setActiveUntil] = useState(device?.activeUntil ?? '')
  const [customFieldIds, setCustomFieldIds] = useState<string[]>(
    device?.customFields?.map((f) => f.id) ?? []
  )
  const [activeTab, setActiveTab] = useState<'general' | 'thresholds'>('general')
  const [saving, setSaving] = useState(false)

  const availableFields = globalFields.filter((f) => {
    if (!f.categories) return true // null = all categories
    try {
      const cats = JSON.parse(f.categories) as string[]
      return cats.length === 0 || cats.includes(category)
    } catch {
      return true
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name, hostname, category, sortOrder, notes, isActive, customFieldIds,
        activeSince: activeSince || null,
        activeUntil: activeUntil || null,
      }
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
      <aside className="drawer" style={{ width: 480 }}>
        <div className="drawer__header">
          <div className="drawer__title">
            {device ? t('customers.editDevice') : t('customers.addDevice')}
          </div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex" style={{ borderBottom: '1px solid var(--color-border)', padding: '0 var(--space-4)' }}>
          {(['general', 'thresholds'] as const).filter(tab => tab === 'general' || device).map((tab) => (
            <button
              key={tab}
              className="btn btn--ghost btn--sm"
              style={{
                borderRadius: 0,
                borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--color-primary)' : undefined,
                marginBottom: -1,
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'general' ? 'General' : 'Thresholds'}
            </button>
          ))}
        </div>

        {activeTab === 'general' ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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

              {/* Active status + date range */}
              <div className="card mb-4" style={{ padding: 'var(--space-3)', borderLeft: '3px solid var(--color-primary)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                  Availability
                </div>
                <label className="checkbox-row mb-3">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{isActive ? 'Active' : 'Inactive'}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-on-surface-muted)' }}>
                      Inactive devices without a date range won't appear in new sheets
                    </div>
                  </div>
                </label>
                <div className="grid-2" style={{ gap: 8 }}>
                  <div className="field">
                    <label className="field__label" style={{ fontSize: 11 }}>Active Since</label>
                    <input className="input" type="date" value={activeSince} onChange={(e) => setActiveSince(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="field__label" style={{ fontSize: 11 }}>Active Until</label>
                    <input className="input" type="date" value={activeUntil} onChange={(e) => setActiveUntil(e.target.value)} />
                  </div>
                </div>
                <div className="field__hint" style={{ marginTop: 4 }}>
                  When a date range is set, the device only appears in maintenance sheets within that period.
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
        ) : (
          <div className="drawer__body">
            {device && (
              <ThresholdPanel deviceId={device.id} globalThresholds={globalThresholds} />
            )}
          </div>
        )}
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
  const [globalThresholds, setGlobalThresholds] = useState<GlobalThreshold[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  const [customerModal, setCustomerModal] = useState<'new' | Customer | null>(null)
  const [deviceModal, setDeviceModal] = useState<'new' | Device | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Customer[]>('/customers?all=true'),
      api.get<CustomFieldDef[]>('/config/custom-fields'),
      api.get<GlobalThreshold[]>('/config/thresholds'),
    ])
      .then(([custData, fieldsData, thData]) => {
        setCustomers(custData)
        setGlobalFields(fieldsData)
        setGlobalThresholds(thData)
        if (custData.length > 0) setSelectedCustomer(custData[0])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedCustomer) return
    api.get<Customer>(`/customers/${selectedCustomer.id}?all=true`).then((c) => setDevices(c.devices ?? []))
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

  const visibleCustomers = customers.filter((c) => showInactive || c.isActive)
  const visibleDevices = devices.filter((d) => showInactive || d.isActive || d.activeSince || d.activeUntil)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('customers.title')}</h1>
        </div>
        <div className="page-header__actions">
          <label className="checkbox-row" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          {isAdmin && (
            <button className="btn btn--primary" onClick={() => setCustomerModal('new')}>
              <span className="material-symbols-outlined icon-sm">add</span>
              {t('customers.add')}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-6)' }}>
        {/* Customer list */}
        <div>
          {visibleCustomers.length === 0 ? (
            <div className="empty-state"><p>{t('customers.noCustomers')}</p></div>
          ) : (
            <ul>
              {visibleCustomers.map((c) => (
                <li key={c.id}>
                  <button
                    className={`sidenav__nav-item${selectedCustomer?.id === c.id ? ' sidenav__nav-item--active' : ''}`}
                    style={{
                      width: '100%',
                      borderLeft: '4px solid transparent',
                      opacity: c.isActive ? 1 : 0.5,
                    }}
                    onClick={() => setSelectedCustomer(c)}
                  >
                    <span className="material-symbols-outlined icon-sm">business</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    {!c.isActive && (
                      <span className="badge badge--neutral" style={{ fontSize: 10 }}>Inactive</span>
                    )}
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

            {visibleDevices.length === 0 ? (
              <div className="empty-state"><p>{t('sheet.noDevices')}</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('customers.hostname')}</th>
                    <th>{t('customers.category')}</th>
                    <th>Active Range</th>
                    <th>{t('common.status')}</th>
                    {isAdmin && <th className="text-right">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleDevices.map((d) => (
                    <tr key={d.id} style={{ opacity: d.isActive ? 1 : 0.6 }}>
                      <td style={{ fontWeight: 500 }}>{d.name}</td>
                      <td className="text-muted">{d.hostname ?? '—'}</td>
                      <td>
                        <span className="badge badge--neutral">
                          {t(`customers.categories.${d.category}` as Parameters<typeof t>[0])}
                        </span>
                      </td>
                      <td className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {d.activeSince || d.activeUntil ? (
                          <span>
                            {d.activeSince ?? '∞'} → {d.activeUntil ?? '∞'}
                          </span>
                        ) : '—'}
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
          globalThresholds={globalThresholds}
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
