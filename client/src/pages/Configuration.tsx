import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import type { GlobalThreshold, CustomFieldDef, DeviceCategory, FieldDataType } from '../types'

const CATEGORIES: DeviceCategory[] = ['SERVER', 'NAS', 'FIREWALL', 'UPS', 'CUSTOM']
const DATA_TYPES: FieldDataType[] = ['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT']

function CustomFieldModal({
  field,
  onClose,
  onSave,
}: {
  field: CustomFieldDef | null
  onClose: () => void
  onSave: (f: CustomFieldDef) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(field?.name ?? '')
  const [unit, setUnit] = useState(field?.unit ?? '')
  const [category, setCategory] = useState<string>(field?.category ?? '')
  const [dataType, setDataType] = useState<FieldDataType>(field?.dataType ?? 'TEXT')
  const [selectOptions, setSelectOptions] = useState(
    field?.selectOptions ? (JSON.parse(field.selectOptions) as string[]).join('\n') : '',
  )
  const [warnCondition, setWarnCondition] = useState(field?.warnCondition ?? '')
  const [isRequired, setIsRequired] = useState(field?.isRequired ?? false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const opts = dataType === 'SELECT'
        ? selectOptions.split('\n').map((s) => s.trim()).filter(Boolean)
        : undefined

      const body = {
        name,
        unit: unit || undefined,
        category: category || undefined,
        dataType,
        selectOptions: opts,
        warnCondition: warnCondition ? JSON.parse(warnCondition) as Record<string, number> : undefined,
        isRequired,
      }

      const result = field
        ? await api.put<CustomFieldDef>(`/config/custom-fields/${field.id}`, body)
        : await api.post<CustomFieldDef>('/config/custom-fields', body)
      onSave(result)
    } catch (err) {
      alert('Error: ' + String(err))
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
            {field ? t('common.edit') : t('config.addField')} {t('config.customFields')}
          </div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="drawer__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="field">
              <label className="field__label">{t('config.fieldName')}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="grid-2">
              <div className="field">
                <label className="field__label">{t('config.unit')}</label>
                <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="GB, Days, %" />
              </div>
              <div className="field">
                <label className="field__label">{t('customers.category')}</label>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">— All categories —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t(`customers.categories.${c}` as Parameters<typeof t>[0])}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="field__label">{t('config.dataType')}</label>
              <select className="select" value={dataType} onChange={(e) => setDataType(e.target.value as FieldDataType)}>
                {DATA_TYPES.map((dt) => (
                  <option key={dt} value={dt}>{t(`config.dataTypes.${dt}` as Parameters<typeof t>[0])}</option>
                ))}
              </select>
            </div>
            {dataType === 'SELECT' && (
              <div className="field">
                <label className="field__label">{t('config.selectOptions')}</label>
                <textarea
                  className="textarea"
                  value={selectOptions}
                  onChange={(e) => setSelectOptions(e.target.value)}
                  placeholder="One option per line"
                  rows={4}
                />
              </div>
            )}
            <div className="field">
              <label className="field__label">{t('config.warnCondition')} (JSON)</label>
              <input
                className="input"
                value={warnCondition}
                onChange={(e) => setWarnCondition(e.target.value)}
                placeholder='{"lt": 50} or {"olderThanDays": 40}'
              />
              <span className="field__hint">Leave blank for no threshold</span>
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
              Required field
            </label>
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

export default function Configuration() {
  const { t } = useTranslation()
  const [thresholds, setThresholds] = useState<GlobalThreshold[]>([])
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([])
  const [fieldModal, setFieldModal] = useState<CustomFieldDef | 'new' | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Local edits to thresholds
  const [tEdits, setTEdits] = useState<Record<string, GlobalThreshold>>({})

  useEffect(() => {
    Promise.all([
      api.get<GlobalThreshold[]>('/config/thresholds'),
      api.get<CustomFieldDef[]>('/config/custom-fields'),
    ]).then(([t, f]) => {
      setThresholds(t)
      setTEdits(Object.fromEntries(t.map((x) => [x.field, { ...x }])))
      setCustomFields(f)
    }).finally(() => setLoading(false))
  }, [])

  const saveThresholds = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await Promise.all(
        Object.values(tEdits).map((th) => api.put(`/config/thresholds/${th.field}`, th)),
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const deleteField = async (f: CustomFieldDef) => {
    if (!confirm(`Delete field "${f.name}"?`)) return
    await api.delete(`/config/custom-fields/${f.id}`)
    setCustomFields((prev) => prev.filter((x) => x.id !== f.id))
  }

  if (loading) return <div className="page loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('config.title')}</h1>
          <p className="page-subtitle">{t('config.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <button className="btn btn--primary" onClick={saveThresholds} disabled={saving}>
            {saving ? <span className="spinner spinner--sm" /> : saved ? <span className="material-symbols-outlined icon-sm">check</span> : <span className="material-symbols-outlined icon-sm">save</span>}
            {saved ? t('config.saved') : t('common.save')}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 'var(--space-6)' }}>
        {/* Left: Global Thresholds */}
        <div>
          <section className="section">
            <div className="section__header">
              <span className="material-symbols-outlined">speed</span>
              <h2 className="section-title">{t('config.globalThresholds')}</h2>
            </div>
            <div className="info-banner mb-4">
              <span className="material-symbols-outlined icon-sm">info</span>
              <span>{t('config.inheritanceInfo')}</span>
            </div>

            {/* diskFreeGB */}
            {['diskFreeGB', 'lastUpdateDate'].map((field) => {
              const th = tEdits[field]
              if (!th) return null
              const isDate = field === 'lastUpdateDate'
              const label = t(`config.${field}` as Parameters<typeof t>[0])
              const unit = isDate ? t('config.days') : t('config.gb')

              return (
                <div key={field} className="card mb-4" style={{ borderLeft: '3px solid var(--color-primary)' }}>
                  <div className="card__header">
                    <div className="card__title">{label}</div>
                    <span className="badge badge--info">Global</span>
                  </div>
                  <div className="grid-2">
                    {isDate ? (
                      <>
                        <div className="field">
                          <label className="field__label">{t('config.warnOlderThan')} ({unit})</label>
                          <input
                            className="input"
                            type="number"
                            value={th.warnOlderThanDays ?? ''}
                            onChange={(e) => setTEdits((p) => ({ ...p, [field]: { ...p[field], warnOlderThanDays: Number(e.target.value) } }))}
                          />
                        </div>
                        <div className="field">
                          <label className="field__label">{t('config.errorOlderThan')} ({unit})</label>
                          <input
                            className="input"
                            type="number"
                            value={th.errorOlderThanDays ?? ''}
                            onChange={(e) => setTEdits((p) => ({ ...p, [field]: { ...p[field], errorOlderThanDays: Number(e.target.value) } }))}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="field">
                          <label className="field__label">{t('config.warnBelow')} ({unit})</label>
                          <input
                            className="input"
                            type="number"
                            value={th.warnBelow ?? ''}
                            onChange={(e) => setTEdits((p) => ({ ...p, [field]: { ...p[field], warnBelow: Number(e.target.value) } }))}
                          />
                        </div>
                        <div className="field">
                          <label className="field__label">{t('config.errorBelow')} ({unit})</label>
                          <input
                            className="input"
                            type="number"
                            value={th.errorBelow ?? ''}
                            onChange={(e) => setTEdits((p) => ({ ...p, [field]: { ...p[field], errorBelow: Number(e.target.value) } }))}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        </div>

        {/* Right: Custom Field Manager */}
        <div>
          <section className="section">
            <div className="section__header">
              <span className="material-symbols-outlined">data_object</span>
              <h2 className="section-title">{t('config.customFields')}</h2>
            </div>
            <p className="text-muted mb-4" style={{ fontSize: 12 }}>{t('config.customFieldsDesc')}</p>
            <button className="btn btn--secondary w-full mb-4" onClick={() => setFieldModal('new')}>
              <span className="material-symbols-outlined icon-sm">add</span>
              {t('config.addField')}
            </button>

            {customFields.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <span className="material-symbols-outlined">data_object</span>
                <p className="text-muted">No custom fields defined.</p>
              </div>
            ) : (
              customFields.map((f) => (
                <div key={f.id} className="card mb-3" style={{ borderLeft: `3px solid ${f.isActive ? 'var(--color-success)' : 'var(--color-outline)'}`, opacity: f.isActive ? 1 : 0.6 }}>
                  <div className="flex-between">
                    <div>
                      <div style={{ fontWeight: 600 }}>{f.name}
                        {f.unit && <span className="text-muted"> ({f.unit})</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-on-surface-muted)', marginTop: 2 }}>
                        {f.category
                          ? t(`customers.categories.${f.category}` as Parameters<typeof t>[0])
                          : 'All categories'}
                        {' · '}
                        {t(`config.dataTypes.${f.dataType}` as Parameters<typeof t>[0])}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setFieldModal(f)}>
                        <span className="material-symbols-outlined icon-sm">edit</span>
                      </button>
                      <button className="btn btn--ghost btn--icon btn--sm" style={{ color: 'var(--color-error)' }} onClick={() => deleteField(f)}>
                        <span className="material-symbols-outlined icon-sm">delete</span>
                      </button>
                    </div>
                  </div>
                  {f.warnCondition && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-warning-text)', background: 'var(--color-warning-bg)', padding: '4px 8px' }}>
                      <span className="material-symbols-outlined icon-sm">warning</span>{' '}
                      Threshold: <code>{f.warnCondition}</code>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      {fieldModal && (
        <CustomFieldModal
          field={fieldModal === 'new' ? null : fieldModal}
          onClose={() => setFieldModal(null)}
          onSave={(f) => {
            setCustomFields((prev) => {
              const exists = prev.find((x) => x.id === f.id)
              return exists ? prev.map((x) => (x.id === f.id ? f : x)) : [...prev, f]
            })
            setFieldModal(null)
          }}
        />
      )}
    </div>
  )
}
