import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import type { GlobalThreshold, CustomFieldDef, DeviceCategory, FieldDataType } from '../types'

const CATEGORIES: DeviceCategory[] = ['SERVER', 'NAS', 'FIREWALL', 'UPS', 'CUSTOM']
const DATA_TYPES: FieldDataType[] = ['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT']

// ─── Parse categories from JSON string ────────────────────────────────────────
function parseCategories(raw: string | null | undefined): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) as string[] } catch { return [] }
}


// ─── Text/Select match-list condition editor (own component so hooks are valid) ─
function TextConditionEditor({
  label, value, onChange, accent,
}: {
  label: string; value: string; onChange: (v: string) => void; accent: 'warning' | 'error'
}) {
  const accentColor = accent === 'warning' ? 'var(--color-warning-text)' : 'var(--color-error)'
  const [inputVal, setInputVal] = useState('')

  let matchTexts: string[] = []
  try { matchTexts = (JSON.parse(value || '{}') as { matchTexts?: string[] }).matchTexts ?? [] } catch { matchTexts = [] }

  const addText = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed || matchTexts.includes(trimmed)) return
    onChange(JSON.stringify({ matchTexts: [...matchTexts, trimmed] }))
    setInputVal('')
  }

  const removeText = (t: string) => {
    const next = matchTexts.filter((x) => x !== t)
    onChange(next.length > 0 ? JSON.stringify({ matchTexts: next }) : '')
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: accentColor, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--color-on-surface-muted)', marginBottom: 6 }}>
        Auslösen wenn Wert übereinstimmt mit (Groß-/Kleinschreibung egal):
      </div>
      <div className="flex flex-wrap gap-1" style={{ marginBottom: 6 }}>
        {matchTexts.map((t) => (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99,
            backgroundColor: accent === 'error' ? 'color-mix(in srgb, var(--color-error) 15%, transparent)' : 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
            border: `1px solid ${accent === 'error' ? 'var(--color-error)' : 'var(--color-warning)'}`,
            fontSize: 11, fontWeight: 500,
          }}>
            {t}
            <button type="button" onClick={() => removeText(t)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit' }}>×</button>
          </span>
        ))}
        {matchTexts.length === 0 && <span style={{ fontSize: 11, color: 'var(--color-on-surface-muted)', fontStyle: 'italic' }}>Noch keine Auslösewerte</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="input" style={{ fontSize: 12 }}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addText(inputVal) } }}
          placeholder="Auslösewert eingeben… (Enter zum Bestätigen)"
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => addText(inputVal)}>Hinzufügen</button>
      </div>
    </div>
  )
}

// ─── Warn/Error Condition GUI Editor ─────────────────────────────────────────
function ConditionEditor({
  label, dataType, value, onChange, accent,
}: {
  label: string; dataType: FieldDataType; value: string
  onChange: (v: string) => void; accent: 'warning' | 'error'
}) {
  const [expertMode, setExpertMode] = useState(false)

  let parsed: Record<string, number> = {}
  try { if (value) parsed = JSON.parse(value) as Record<string, number> } catch { parsed = {} }

  const updateParsed = (patch: Record<string, number | ''>) => {
    const next: Record<string, number> = { ...parsed }
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || isNaN(Number(v))) { delete next[k] } else { next[k] = Number(v) }
    }
    onChange(Object.keys(next).length > 0 ? JSON.stringify(next) : '')
  }

  const accentColor = accent === 'warning' ? 'var(--color-warning-text)' : 'var(--color-error)'

  // TEXT and SELECT: delegate to dedicated component (avoids conditional hook)
  if (dataType === 'TEXT' || dataType === 'SELECT') {
    return <TextConditionEditor label={label} value={value} onChange={onChange} accent={accent} />
  }

  if (expertMode) {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: accentColor, marginBottom: 4 }}>{label}</div>
        <textarea className="textarea" rows={2} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder='{"lt": 50} or {"olderThanDays": 40}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
        <button className="btn btn--ghost btn--sm mt-1" style={{ fontSize: 11 }} onClick={() => setExpertMode(false)}>
          <span className="material-symbols-outlined icon-sm">tune</span> Switch to GUI
        </button>
      </div>
    )
  }

  if (dataType === 'NUMBER') {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: accentColor, marginBottom: 6 }}>{label}</div>
        <div className="grid-2" style={{ gap: 8 }}>
          <div className="field">
            <label className="field__label" style={{ fontSize: 11 }}>Unter</label>
            <input className="input" type="number" value={parsed['lt'] ?? ''}
              onChange={(e) => updateParsed({ lt: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="—" />
          </div>
          <div className="field">
            <label className="field__label" style={{ fontSize: 11 }}>Über</label>
            <input className="input" type="number" value={parsed['gt'] ?? ''}
              onChange={(e) => updateParsed({ gt: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="—" />
          </div>
        </div>
        <button className="btn btn--ghost btn--sm mt-1" style={{ fontSize: 11 }} onClick={() => setExpertMode(true)}>
          <span className="material-symbols-outlined icon-sm">code</span> Expert JSON
        </button>
      </div>
    )
  }

  if (dataType === 'DATE') {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: accentColor, marginBottom: 6 }}>{label}</div>
        <div className="field">
          <label className="field__label" style={{ fontSize: 11 }}>Älter als (Tage)</label>
          <input className="input" type="number" value={parsed['olderThanDays'] ?? ''}
            onChange={(e) => updateParsed({ olderThanDays: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="—" />
        </div>
        <button className="btn btn--ghost btn--sm mt-1" style={{ fontSize: 11 }} onClick={() => setExpertMode(true)}>
          <span className="material-symbols-outlined icon-sm">code</span> Expert JSON
        </button>
      </div>
    )
  }

  // BOOLEAN fallback
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: accentColor, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--color-on-surface-muted)', marginBottom: 6 }}>
        BOOLEAN: use <code>{'{"expectTrue":true}'}</code> or <code>{'{"expectFalse":true}'}</code>
      </div>
      <textarea className="textarea" rows={2} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder='{"expectTrue": true}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
    </div>
  )
}

// ─── Multi-category picker ────────────────────────────────────────────────────
function CategoryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()

  const toggle = (cat: string) => {
    const next = value.includes(cat) ? value.filter((c) => c !== cat) : [...value, cat]
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-2" style={{ marginTop: 4 }}>
      <button
        type="button"
        className={`btn btn--sm ${value.length === 0 ? 'btn--primary' : 'btn--ghost'}`}
        style={{ fontSize: 11 }}
        onClick={() => onChange([])}
      >
        All categories
      </button>
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          className={`btn btn--sm ${value.includes(cat) ? 'btn--secondary' : 'btn--ghost'}`}
          style={{ fontSize: 11 }}
          onClick={() => toggle(cat)}
        >
          {t(`customers.categories.${cat}` as Parameters<typeof t>[0])}
        </button>
      ))}
    </div>
  )
}

// ─── Custom Field Modal ───────────────────────────────────────────────────────
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
  const [categories, setCategories] = useState<string[]>(parseCategories(field?.categories))
  const [dataType, setDataType] = useState<FieldDataType>(field?.dataType ?? 'TEXT')
  const [selectOptions, setSelectOptions] = useState(
    field?.selectOptions ? (JSON.parse(field.selectOptions) as string[]).join('\n') : '',
  )
  const [warnCondition, setWarnCondition] = useState(field?.warnCondition ?? '')
  const [errorCondition, setErrorCondition] = useState(field?.errorCondition ?? '')
  const [isRequired, setIsRequired] = useState(field?.isRequired ?? false)
  const [saving, setSaving] = useState(false)
  const [jsonError, setJsonError] = useState('')

  const parseCondition = (raw: string): Record<string, number> | null => {
    if (!raw.trim()) return null
    try {
      const parsed = JSON.parse(raw)
      setJsonError('')
      return parsed as Record<string, number>
    } catch {
      setJsonError('Invalid JSON in condition')
      return undefined as unknown as null
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const warnParsed = parseCondition(warnCondition)
    const errorParsed = parseCondition(errorCondition)
    if (warnParsed === undefined || errorParsed === undefined) return

    setSaving(true)
    try {
      const opts = dataType === 'SELECT'
        ? selectOptions.split('\n').map((s) => s.trim()).filter(Boolean)
        : undefined

      const body = {
        name,
        unit: unit || undefined,
        categories: categories.length > 0 ? categories : null,
        dataType,
        selectOptions: opts,
        warnCondition: warnParsed,
        errorCondition: errorParsed,
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
            {field ? t('common.edit') : t('config.addField')} — {t('config.customFields')}
          </div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="drawer__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Name + Unit */}
            <div className="grid-2">
              <div className="field">
                <label className="field__label">{t('config.fieldName')}</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              <div className="field">
                <label className="field__label">{t('config.unit')}</label>
                <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="GB, Days, %" />
              </div>
            </div>

            {/* Data type */}
            <div className="field">
              <label className="field__label">{t('config.dataType')}</label>
              <select className="select" value={dataType} onChange={(e) => {
                setDataType(e.target.value as FieldDataType)
                setWarnCondition('')
                setErrorCondition('')
              }}>
                {DATA_TYPES.map((dt) => (
                  <option key={dt} value={dt}>{t(`config.dataTypes.${dt}` as Parameters<typeof t>[0])}</option>
                ))}
              </select>
            </div>

            {/* Select options */}
            {dataType === 'SELECT' && (
              <div className="field">
                <label className="field__label">{t('config.selectOptions')}</label>
                <textarea className="textarea" value={selectOptions} onChange={(e) => setSelectOptions(e.target.value)}
                  placeholder="One option per line" rows={4} />
              </div>
            )}

            {/* Categories (multi-select) */}
            <div className="field">
              <label className="field__label">Applicable categories</label>
              <CategoryPicker value={categories} onChange={setCategories} />
              <span className="field__hint">Select which device types this field applies to. Leave all unselected = applies to all.</span>
            </div>

            {/* Threshold conditions for NUMBER and DATE */}
            {(dataType === 'NUMBER' || dataType === 'DATE') && (
              <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                  Threshold Conditions
                </div>
                <ConditionEditor
                  label="⚠ Warning condition"
                  dataType={dataType}
                  value={warnCondition}
                  onChange={setWarnCondition}
                  accent="warning"
                />
                <ConditionEditor
                  label="✕ Error / Fail condition"
                  dataType={dataType}
                  value={errorCondition}
                  onChange={setErrorCondition}
                  accent="error"
                />
                {jsonError && <span className="field__hint" style={{ color: 'var(--color-error)' }}>{jsonError}</span>}
              </div>
            )}

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
  const [tEdits, setTEdits] = useState<Record<string, GlobalThreshold>>({})

  useEffect(() => {
    Promise.all([
      api.get<GlobalThreshold[]>('/config/thresholds'),
      api.get<CustomFieldDef[]>('/config/custom-fields'),
    ]).then(([th, f]) => {
      setThresholds(th)
      setTEdits(Object.fromEntries(th.map((x) => [x.field, { ...x }])))
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
            {saved ? 'Saved!' : t('common.save')}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 'var(--space-6)' }}>
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
                          <label className="field__label" style={{ color: 'var(--color-warning-text)' }}>⚠ Warn older than ({unit})</label>
                          <input className="input" type="number"
                            value={th.warnOlderThanDays ?? ''}
                            onChange={(e) => setTEdits((p) => ({ ...p, [field]: { ...p[field], warnOlderThanDays: Number(e.target.value) } }))}
                          />
                        </div>
                        <div className="field">
                          <label className="field__label" style={{ color: 'var(--color-error)' }}>✕ Error older than ({unit})</label>
                          <input className="input" type="number"
                            value={th.errorOlderThanDays ?? ''}
                            onChange={(e) => setTEdits((p) => ({ ...p, [field]: { ...p[field], errorOlderThanDays: Number(e.target.value) } }))}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="field">
                          <label className="field__label" style={{ color: 'var(--color-warning-text)' }}>⚠ Warn below ({unit})</label>
                          <input className="input" type="number"
                            value={th.warnBelow ?? ''}
                            onChange={(e) => setTEdits((p) => ({ ...p, [field]: { ...p[field], warnBelow: Number(e.target.value) } }))}
                          />
                        </div>
                        <div className="field">
                          <label className="field__label" style={{ color: 'var(--color-error)' }}>✕ Error below ({unit})</label>
                          <input className="input" type="number"
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
              customFields.map((f) => {
                const cats = parseCategories(f.categories)
                return (
                  <div key={f.id} className="card mb-3" style={{ borderLeft: `3px solid ${f.isActive ? 'var(--color-success)' : 'var(--color-outline)'}`, opacity: f.isActive ? 1 : 0.6 }}>
                    <div className="flex-between">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {f.name}
                          {f.unit && <span className="text-muted"> ({f.unit})</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-on-surface-muted)', marginTop: 2 }}>
                          {cats.length > 0
                            ? cats.join(', ')
                            : 'All categories'}
                          {' · '}
                          {t(`config.dataTypes.${f.dataType}` as Parameters<typeof t>[0])}
                          {f.isRequired && ' · Required'}
                        </div>
                        {f.warnCondition && (
                          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--color-warning-text)' }}>
                            ⚠ {f.warnCondition}
                          </div>
                        )}
                        {f.errorCondition && (
                          <div style={{ marginTop: 2, fontSize: 10, color: 'var(--color-error)' }}>
                            ✕ {f.errorCondition}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1" style={{ flexShrink: 0, marginLeft: 8 }}>
                        <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setFieldModal(f)}>
                          <span className="material-symbols-outlined icon-sm">edit</span>
                        </button>
                        <button className="btn btn--ghost btn--icon btn--sm" style={{ color: 'var(--color-error)' }} onClick={() => deleteField(f)}>
                          <span className="material-symbols-outlined icon-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
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
