import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import type { MonthlySheet, DeviceRecord, Comment, DeviceCategory, CommentSeverity } from '../types'

// ─── Threshold evaluation (mirrored client-side for instant highlighting) ─────
function getCellStatus(
  field: 'diskFreeGB' | 'lastUpdateDate',
  value: number | string | null,
): 'ok' | 'warning' | 'error' {
  if (value == null || value === '') return 'ok'

  if (field === 'diskFreeGB') {
    const n = Number(value)
    if (n < 10) return 'error'
    if (n < 20) return 'warning'
    return 'ok'
  }

  if (field === 'lastUpdateDate') {
    const d = new Date(value as string)
    if (isNaN(d.getTime())) return 'ok'
    const days = (Date.now() - d.getTime()) / 86400000
    if (days > 60) return 'error'
    if (days > 40) return 'warning'
    return 'ok'
  }

  return 'ok'
}

// ─── Comment Drawer ───────────────────────────────────────────────────────────
function CommentDrawer({
  record,
  onClose,
  onUpdate,
}: {
  record: DeviceRecord
  onClose: () => void
  onUpdate: (recordId: string, comments: Comment[]) => void
}) {
  const { t } = useTranslation()
  const [comments, setComments] = useState<Comment[]>(record.comments)
  const [text, setText] = useState('')
  const [severity, setSeverity] = useState<CommentSeverity>('INFO')
  const [saving, setSaving] = useState(false)

  const addComment = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      const c = await api.post<Comment>(`/comments/record/${record.id}`, { text, severity })
      const updated = [...comments, c]
      setComments(updated)
      onUpdate(record.id, updated)
      setText('')
      setSeverity('INFO')
    } finally {
      setSaving(false)
    }
  }

  const toggleResolved = async (c: Comment) => {
    const updated = await api.put<Comment>(`/comments/${c.id}`, { resolved: !c.resolved })
    const list = comments.map((x) => (x.id === c.id ? updated : x))
    setComments(list)
    onUpdate(record.id, list)
  }

  const deleteComment = async (c: Comment) => {
    if (!confirm(t('comments.deleteConfirm'))) return
    await api.delete(`/comments/${c.id}`)
    const list = comments.filter((x) => x.id !== c.id)
    setComments(list)
    onUpdate(record.id, list)
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer__header">
          <div>
            <div className="drawer__title">{t('comments.title')}</div>
            <div style={{ fontSize: 12, color: 'var(--color-on-surface-muted)', marginTop: 2 }}>
              {record.device.name}
              {record.device.hostname ? ` (${record.device.hostname})` : ''}
            </div>
          </div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
        </div>

        <div className="drawer__body">
          {comments.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <span className="material-symbols-outlined">chat_bubble_outline</span>
              <p>{t('comments.noComments')}</p>
            </div>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className={`comment-item comment-item--${c.severity} ${c.resolved ? 'comment-item--resolved' : ''}`}
              >
                <div className="comment-item__meta">
                  <span className={`badge badge--${c.severity === 'CRITICAL' ? 'critical' : c.severity === 'WARNING' ? 'warning' : 'neutral'}`}>
                    {c.severity}
                  </span>
                  <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                  {c.resolved && (
                    <span className="badge badge--ok">
                      <span className="material-symbols-outlined icon-sm">check</span>
                      {t('comments.resolved')}
                    </span>
                  )}
                </div>
                <div className="comment-item__text">{c.text}</div>
                <div className="flex-center gap-2 mt-2">
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleResolved(c)}>
                    <span className="material-symbols-outlined icon-sm">
                      {c.resolved ? 'undo' : 'check'}
                    </span>
                    {c.resolved ? t('comments.unresolve') : t('comments.resolve')}
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ color: 'var(--color-error)' }}
                    onClick={() => deleteComment(c)}
                  >
                    <span className="material-symbols-outlined icon-sm">delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="drawer__footer">
          <div className="field mb-2">
            <select
              className="select"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as CommentSeverity)}
            >
              <option value="INFO">{t('common.info')}</option>
              <option value="WARNING">{t('common.warning')}</option>
              <option value="CRITICAL">{t('common.critical')}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <textarea
              className="textarea flex-1"
              rows={2}
              placeholder={t('comments.placeholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) addComment()
              }}
            />
            <button className="btn btn--primary btn--icon" onClick={addComment} disabled={saving || !text.trim()}>
              {saving ? <span className="spinner spinner--sm" /> : <span className="material-symbols-outlined icon-sm">send</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

// ─── Device Card (NAS, Firewall, UPS, Custom) ────────────────────────────────
function DeviceCard({
  record,
  onOpenComments,
  onChange,
}: {
  record: DeviceRecord
  onOpenComments: () => void
  onChange: (recordId: string, patch: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const fieldDefs = record.device.customFields ?? []

  const getCustomValue = (fieldId: string) =>
    record.customValues.find((v) => v.fieldDefId === fieldId)?.value ?? ''

  const handleCustomChange = (fieldId: string, value: string) => {
    onChange(record.id, { customValues: { [fieldId]: value } })
  }

  const openCount = record.comments.filter((c) => !c.resolved).length

  return (
    <div className={`card card--${record.overallStatus.toLowerCase()}`}>
      <div className="card__header">
        <div>
          <div className="card__title">{record.device.name}</div>
          {record.device.hostname && (
            <div style={{ fontSize: 12, color: 'var(--color-on-surface-muted)' }}>
              {record.device.hostname}
            </div>
          )}
        </div>
        <div className="flex-center gap-2">
          <span
            className={`material-symbols-outlined ${
              record.overallStatus === 'OK'
                ? 'text-success'
                : record.overallStatus === 'WARNING'
                ? 'text-warning'
                : 'text-error'
            }`}
          >
            {record.overallStatus === 'OK' ? 'check_circle' : 'warning'}
          </span>
          <button className="btn btn--ghost btn--sm" onClick={onOpenComments}>
            <span className="material-symbols-outlined icon-sm">chat_bubble</span>
            {openCount > 0 && <span className="comment-count">{openCount}</span>}
          </button>
        </div>
      </div>

      <div className="grid-2">
        {fieldDefs.map((fd) => {
          const val = getCustomValue(fd.id)
          return (
            <div key={fd.id} className="field">
              <label className="field__label">
                {fd.name}
                {fd.unit && <span className="text-subtle"> ({fd.unit})</span>}
              </label>
              {fd.dataType === 'BOOLEAN' ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={val === 'true'}
                    onChange={(e) => handleCustomChange(fd.id, String(e.target.checked))}
                  />
                  {val === 'true' ? t('common.yes') : t('common.no')}
                </label>
              ) : fd.dataType === 'SELECT' ? (
                <select
                  className="select"
                  value={val}
                  onChange={(e) => handleCustomChange(fd.id, e.target.value)}
                >
                  <option value="">—</option>
                  {JSON.parse(fd.selectOptions ?? '[]').map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  type={fd.dataType === 'NUMBER' ? 'number' : fd.dataType === 'DATE' ? 'date' : 'text'}
                  value={val}
                  onChange={(e) => handleCustomChange(fd.id, e.target.value)}
                />
              )}
            </div>
          )
        })}

        {/* Notes/comments textarea */}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field__label">{t('sheet.comments')}</label>
          <button className="btn btn--ghost btn--sm" onClick={onOpenComments} style={{ justifyContent: 'flex-start' }}>
            <span className="material-symbols-outlined icon-sm">add_comment</span>
            {openCount > 0
              ? `${openCount} open comment${openCount > 1 ? 's' : ''}`
              : t('comments.noComments')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Server Table Row ─────────────────────────────────────────────────────────
function ServerRow({
  record,
  customFieldDefs,
  onOpenComments,
  onChange,
}: {
  record: DeviceRecord
  customFieldDefs: { id: string; name: string; unit: string | null }[]
  onOpenComments: () => void
  onChange: (recordId: string, patch: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const diskStatus = getCellStatus('diskFreeGB', record.diskFreeGB)
  const updateStatus = getCellStatus('lastUpdateDate', record.lastUpdateDate)
  const openCount = record.comments.filter((c) => !c.resolved).length

  const getCustomValue = (fieldId: string) =>
    record.customValues.find((v) => v.fieldDefId === fieldId)?.value ?? ''

  return (
    <tr>
      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
        <div>{record.device.name}</div>
        {record.device.hostname && (
          <div style={{ fontSize: 11, color: 'var(--color-on-surface-muted)' }}>
            {record.device.hostname}
          </div>
        )}
      </td>

      {/* Status icon */}
      <td style={{ textAlign: 'center' }}>
        <span className={`material-symbols-outlined ${record.overallStatus === 'OK' ? 'text-success' : record.overallStatus === 'WARNING' ? '' : 'text-error'}`}
          style={record.overallStatus === 'WARNING' ? { color: 'var(--color-warning)' } : undefined}>
          {record.overallStatus === 'OK' ? 'check_circle' : 'warning'}
        </span>
      </td>

      {/* Uptime */}
      <td>
        <input
          className="table-input"
          type="number"
          min={0}
          value={record.uptimeDays ?? ''}
          onChange={(e) => onChange(record.id, { uptimeDays: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="—"
        />
      </td>

      {/* Disk Free */}
      <td className={diskStatus !== 'ok' ? `cell--${diskStatus}` : ''}>
        <div className="flex-center gap-1">
          <input
            className="table-input"
            type="number"
            min={0}
            step={0.1}
            value={record.diskFreeGB ?? ''}
            onChange={(e) => onChange(record.id, { diskFreeGB: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="—"
          />
          {diskStatus !== 'ok' && (
            <span className={`material-symbols-outlined icon-sm ${diskStatus === 'error' ? 'text-error' : ''}`}
              style={diskStatus === 'warning' ? { color: 'var(--color-warning)' } : undefined}>
              arrow_downward
            </span>
          )}
        </div>
      </td>

      {/* Eventlogs */}
      <td style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={record.eventlogsOk ?? false}
          onChange={(e) => onChange(record.id, { eventlogsOk: e.target.checked })}
          title={record.eventlogsOk ? t('sheet.ok') : t('sheet.notOk')}
          style={{ accentColor: 'var(--color-primary)', width: 16, height: 16, cursor: 'pointer' }}
        />
      </td>

      {/* Last Update */}
      <td className={updateStatus !== 'ok' ? `cell--${updateStatus}` : ''}>
        <div className="flex-center gap-1">
          <input
            className="table-input"
            type="date"
            value={record.lastUpdateDate ?? ''}
            onChange={(e) => onChange(record.id, { lastUpdateDate: e.target.value || null })}
          />
          {updateStatus !== 'ok' && (
            <span className={`material-symbols-outlined icon-sm ${updateStatus === 'error' ? 'text-error' : ''}`}
              style={updateStatus === 'warning' ? { color: 'var(--color-warning)' } : undefined}>
              schedule
            </span>
          )}
        </div>
      </td>

      {/* Custom fields */}
      {customFieldDefs.map((fd) => (
        <td key={fd.id}>
          <input
            className="table-input"
            type="text"
            value={getCustomValue(fd.id)}
            onChange={(e) =>
              onChange(record.id, { customValues: { [fd.id]: e.target.value } })
            }
            placeholder="—"
          />
        </td>
      ))}

      {/* Comments */}
      <td>
        <button className="btn btn--ghost btn--sm" onClick={onOpenComments}>
          <span className="material-symbols-outlined icon-sm">chat_bubble</span>
          {openCount > 0 && (
            <span className="comment-count">{openCount}</span>
          )}
        </button>
      </td>
    </tr>
  )
}

// ─── Main Sheet Page ──────────────────────────────────────────────────────────
const CATEGORIES: DeviceCategory[] = ['SERVER', 'NAS', 'FIREWALL', 'UPS', 'CUSTOM']

export default function MaintenanceSheet() {
  const { sheetId } = useParams<{ sheetId: string }>()
  const { t } = useTranslation()
  const [sheet, setSheet] = useState<MonthlySheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<DeviceRecord | null>(null)

  // Dirty tracking: recordId -> patch
  const dirty = useRef<Map<string, Record<string, unknown>>>(new Map())

  const loadSheet = useCallback(async () => {
    if (!sheetId) return
    const s = await api.get<MonthlySheet>(`/sheets/${sheetId}`)
    setSheet(s)
    setLoading(false)
  }, [sheetId])

  useEffect(() => { loadSheet() }, [loadSheet])

  // Called by row/card on any field change
  const handleChange = useCallback((recordId: string, patch: Record<string, unknown>) => {
    const existing = dirty.current.get(recordId) ?? {}
    // Merge custom values
    if (patch.customValues) {
      existing.customValues = { ...(existing.customValues as Record<string, string> ?? {}), ...(patch.customValues as Record<string, string>) }
      const { customValues: _, ...rest } = patch
      dirty.current.set(recordId, { ...existing, ...rest })
    } else {
      dirty.current.set(recordId, { ...existing, ...patch })
    }

    // Optimistic UI update
    setSheet((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        deviceRecords: prev.deviceRecords!.map((r) => {
          if (r.id !== recordId) return r
          const { customValues: cvPatch, ...stdPatch } = patch
          const updated = { ...r, ...stdPatch }
          if (cvPatch) {
            updated.customValues = r.customValues.map((cv) => {
          const val = (cvPatch as Record<string, string>)[cv.fieldDefId]
          return val !== undefined ? { ...cv, value: val } : cv
        })
        // Add new values not yet in list
        Object.entries(cvPatch as Record<string, string>).forEach(([fid, val]) => {
          if (!updated.customValues.find((cv) => cv.fieldDefId === fid)) {
            updated.customValues.push({ id: '', recordId, fieldDefId: fid, fieldDef: r.device.customFields!.find(d => d.id === fid)!, value: val, updatedAt: new Date().toISOString() })
          }
        })
      }
      return updated
    }),
      }
    })
  }, [])

  const handleSheetUpdate = async (patch: Partial<MonthlySheet>) => {
    // Optimistic UI
    setSheet(prev => prev ? { ...prev, ...patch } : prev)
    // Send to API immediately for sheet fields
    await api.patch(`/sheets/${sheet.id}`, patch)
  }

  const handleSaveAll = async () => {
    if (dirty.current.size === 0) return
    setSaving(true)
    setSaved(false)
    try {
      const records = Array.from(dirty.current.entries()).map(([recordId, patch]) => ({
        recordId,
        ...patch,
      }))
      await api.post('/records/batch', { records })
      dirty.current.clear()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      // Reload to get updated statuses
      await loadSheet()
    } finally {
      setSaving(false)
    }
  }

  const handleCommentUpdate = (recordId: string, comments: Comment[]) => {
    setSheet((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        deviceRecords: prev.deviceRecords!.map((r) =>
          r.id === recordId ? { ...r, comments } : r,
        ),
      }
    })
  }

  if (loading || !sheet) {
    return (
      <div className="page loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  const monthName = t(`months.${sheet.month}` as Parameters<typeof t>[0])
  const recordsByCategory = (cat: DeviceCategory) =>
    sheet.deviceRecords?.filter((r) => r.device.category === cat) ?? []

  // Collect all server-level custom field defs (union of all server records)
  const serverCustomFields = Array.from(
    new Map(
      (sheet.deviceRecords ?? [])
        .filter((r) => r.device.category === 'SERVER')
        .flatMap((r) => r.device.customFields ?? [])
        .map((fd) => [fd.id, fd]),
    ).values(),
  )

  return (
    <div className="page--full" style={{ padding: 'var(--space-6)' }}>
      {/* Page header */}
      <div className="page-header flex-wrap" style={{ gap: '2rem' }}>
        <div>
          <h1 className="page-title">
            {sheet.customer?.name}
          </h1>
          <p className="page-subtitle">
            {monthName} {sheet.year}
          </p>
        </div>
        
        <div className="flex gap-4" style={{ flex: 1 }}>
          <div className="field" style={{ flex: 1, minWidth: 200, maxWidth: 300 }}>
            <label className="field__label">{t('sheet.technicianName', 'Technician Name')}</label>
            <input 
              className="input" 
              type="text" 
              value={sheet.technicianName ?? ''}
              onChange={(e) => setSheet(s => s ? { ...s, technicianName: e.target.value } : s)}
              onBlur={(e) => handleSheetUpdate({ technicianName: e.target.value || null })}
              placeholder={t('sheet.technicianPlaceholder', 'Who checked the servers?')}
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150, maxWidth: 200 }}>
            <label className="field__label">{t('sheet.maintenanceDate', 'Maintenance Date')}</label>
            <input 
              className="input" 
              type="date" 
              value={sheet.maintenanceDate ?? ''}
              onChange={(e) => setSheet(s => s ? { ...s, maintenanceDate: e.target.value } : s)}
              onBlur={(e) => handleSheetUpdate({ maintenanceDate: e.target.value || null })}
            />
          </div>
        </div>

        <div className="page-header__actions">
          <span className={`badge ${sheet.status === 'COMPLETE' ? 'badge--ok' : 'badge--neutral'}`}>
            {t(`common.${sheet.status.toLowerCase()}` as Parameters<typeof t>[0])}
          </span>
          <button
            className="btn btn--primary"
            onClick={handleSaveAll}
            disabled={saving}
          >
            {saving ? (
              <span className="spinner spinner--sm" />
            ) : saved ? (
              <span className="material-symbols-outlined icon-sm">check</span>
            ) : (
              <span className="material-symbols-outlined icon-sm">save</span>
            )}
            {saving ? t('sheet.saving') : saved ? t('sheet.saved') : t('common.saveAll')}
          </button>
        </div>
      </div>

      {/* ── Servers ── */}
      {recordsByCategory('SERVER').length > 0 && (
        <section className="section">
          <div className="section__header">
            <span className="material-symbols-outlined">dns</span>
            <h2 className="section-title">{t('sheet.servers')}</h2>
            <span className="badge badge--neutral" style={{ marginLeft: 'auto' }}>
              {recordsByCategory('SERVER').length}
            </span>
          </div>

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('sheet.uptime')}</th>
                  <th>{t('sheet.diskFree')}</th>
                  <th>{t('sheet.eventlogs')}</th>
                  <th>{t('sheet.lastUpdate')}</th>
                  {serverCustomFields.map((fd) => (
                    <th key={fd.id}>
                      {fd.name}
                      {fd.unit && <span className="text-subtle"> ({fd.unit})</span>}
                    </th>
                  ))}
                  <th>{t('sheet.comments')}</th>
                </tr>
              </thead>
              <tbody>
                {recordsByCategory('SERVER').map((record) => (
                  <ServerRow
                    key={record.id}
                    record={record}
                    customFieldDefs={serverCustomFields}
                    onOpenComments={() => setDrawerRecord(record)}
                    onChange={handleChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Other device categories ── */}
      {(['NAS', 'FIREWALL', 'UPS', 'CUSTOM'] as DeviceCategory[]).map((cat) => {
        const records = recordsByCategory(cat)
        if (records.length === 0) return null
        const sectionKey = { NAS: 'nasDevices', FIREWALL: 'firewalls', UPS: 'ups', CUSTOM: 'custom' }[cat]
        const icon = { NAS: 'storage', FIREWALL: 'security', UPS: 'bolt', CUSTOM: 'devices' }[cat]

        return (
          <section key={cat} className="section">
            <div className="section__header">
              <span className="material-symbols-outlined">{icon}</span>
              <h2 className="section-title">{t(`sheet.${sectionKey}` as Parameters<typeof t>[0])}</h2>
              <span className="badge badge--neutral" style={{ marginLeft: 'auto' }}>
                {records.length}
              </span>
            </div>

            <div className="grid-2">
              {records.map((record) => (
                <DeviceCard
                  key={record.id}
                  record={record}
                  onOpenComments={() => setDrawerRecord(record)}
                  onChange={handleChange}
                />
              ))}
            </div>
          </section>
        )
      })}

      {/* Empty */}
      {(sheet.deviceRecords ?? []).length === 0 && (
        <div className="empty-state">
          <span className="material-symbols-outlined">devices</span>
          <p>{t('sheet.noDevices')}</p>
        </div>
      )}

      {/* Comment Drawer */}
      {drawerRecord && (
        <CommentDrawer
          record={drawerRecord}
          onClose={() => setDrawerRecord(null)}
          onUpdate={handleCommentUpdate}
        />
      )}
    </div>
  )
}
