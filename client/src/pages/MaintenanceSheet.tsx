import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import { useAuthStore } from '../stores/useAuthStore'
import type { MonthlySheet, DeviceRecord, Comment, DeviceCategory, CommentSeverity, GlobalThreshold, ThresholdOverride } from '../types'
import { formatDateDDMMYYYY } from '../utils/date'

// ─── Reference date for threshold evaluation ──────────────────────────────────
// When viewing an old sheet, use the sheet's maintenanceDate as "today" so thresholds
// don't wrongfully flag entries that were fine at the time.
function getRefDate(sheet: MonthlySheet): Date {
  if (sheet.maintenanceDate) {
    const d = new Date(sheet.maintenanceDate)
    if (!isNaN(d.getTime())) return d
  }
  const d = new Date(sheet.createdAt)
  if (!isNaN(d.getTime())) return d
  return new Date()
}

// ─── Resolved threshold type ──────────────────────────────────────────────────
interface ResolvedThreshold {
  warnBelow?: number | null
  errorBelow?: number | null
  warnAbove?: number | null
  errorAbove?: number | null
  warnOlderThanDays?: number | null
  errorOlderThanDays?: number | null
}

function resolveThreshold(
  field: string,
  deviceId: string,
  globals: GlobalThreshold[],
  overrides: ThresholdOverride[],
): ResolvedThreshold {
  // Device-level override has highest priority
  const dev = overrides.find((o) => o.deviceId === deviceId && o.field === field)
  if (dev) return dev
  // Fall back to global
  const g = globals.find((g) => g.field === field)
  return g ?? {}
}

// ─── Threshold evaluation (dynamic, reference-date aware) ────────────────────
function getCellStatus(
  field: 'diskFreeGB' | 'lastUpdateDate',
  value: number | string | null,
  refDate: Date,
  th: ResolvedThreshold,
): 'ok' | 'warning' | 'error' {
  if (value == null || value === '') return 'ok'

  if (field === 'diskFreeGB') {
    const n = Number(value)
    if (th.errorBelow != null && n < th.errorBelow) return 'error'
    if (th.warnBelow != null && n < th.warnBelow) return 'warning'
    if (th.errorAbove != null && n > th.errorAbove) return 'error'
    if (th.warnAbove != null && n > th.warnAbove) return 'warning'
    return 'ok'
  }

  if (field === 'lastUpdateDate') {
    const d = new Date(value as string)
    if (isNaN(d.getTime())) return 'ok'
    const days = (refDate.getTime() - d.getTime()) / 86400000
    if (th.errorOlderThanDays != null && days > th.errorOlderThanDays) return 'error'
    if (th.warnOlderThanDays != null && days > th.warnOlderThanDays) return 'warning'
    return 'ok'
  }

  return 'ok'
}

// ─── Custom field threshold evaluation ────────────────────────────────────────
// Condition JSON format (stored in warnCondition / errorCondition):
//   NUMBER:  { lt?: number; gt?: number }
//   DATE:    { olderThanDays?: number }
//   BOOLEAN: { expectTrue?: boolean; expectFalse?: boolean }
//   TEXT/SELECT: { matchTexts?: string[] }  ← NEW: list of trigger values
function evalCondition(
  condition: string | null,
  value: string,
  dataType: string,
): boolean {
  if (!condition || !value) return false
  try {
    const cond = JSON.parse(condition) as Record<string, unknown>
    if (dataType === 'NUMBER') {
      const n = Number(value)
      if (isNaN(n)) return false
      if (cond.lt != null && n < (cond.lt as number)) return true
      if (cond.gt != null && n > (cond.gt as number)) return true
    } else if (dataType === 'DATE') {
      const d = new Date(value)
      if (isNaN(d.getTime())) return false
      if (cond.olderThanDays != null) {
        const days = (Date.now() - d.getTime()) / 86400000
        if (days > (cond.olderThanDays as number)) return true
      }
    } else if (dataType === 'BOOLEAN') {
      if (cond.expectTrue && value !== 'true') return true
      if (cond.expectFalse && value !== 'false') return true
    } else {
      // TEXT or SELECT — match against list
      const texts = (cond.matchTexts ?? []) as string[]
      if (texts.length > 0 && texts.some((t) => t.toLowerCase() === value.toLowerCase())) return true
    }
  } catch { /* ignore */ }
  return false
}

function getCustomFieldStatus(
  fd: { dataType: string; warnCondition: string | null; errorCondition: string | null },
  value: string,
): 'ok' | 'warning' | 'error' {
  if (!value) return 'ok'
  if (evalCondition(fd.errorCondition, value, fd.dataType)) return 'error'
  if (evalCondition(fd.warnCondition, value, fd.dataType)) return 'warning'
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
  const [persistent, setPersistent] = useState(false)
  const [saving, setSaving] = useState(false)

  const addComment = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      const c = await api.post<Comment>(`/comments/record/${record.id}`, { text, severity, persistent })
      const updated = [...comments, c]
      setComments(updated)
      onUpdate(record.id, updated)
      setText('')
      setSeverity('INFO')
      setPersistent(false)
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
                  <span>{formatDateDDMMYYYY(c.createdAt)}</span>
                  {c.resolved && (
                    <span className="badge badge--ok">
                      <span className="material-symbols-outlined icon-sm">check</span>
                      {t('comments.resolved')}
                    </span>
                  )}
                  {c.persistent && (
                    <span className="badge badge--info">{t('comments.persistent', 'Persistent')}</span>
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
                  <button className="btn btn--ghost btn--sm" onClick={async () => {
                    const updated = await api.put<Comment>(`/comments/${c.id}`, { persistent: !c.persistent })
                    const list = comments.map((x) => (x.id === c.id ? updated : x))
                    setComments(list)
                    onUpdate(record.id, list)
                  }}>
                    <span className="material-symbols-outlined icon-sm">{c.persistent ? 'label_off' : 'label'}</span>
                    {c.persistent ? t('comments.unmarkPersistent', 'Unset persistent') : t('comments.markPersistent', 'Mark persistent')}
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
          <label className="checkbox-row mb-2">
            <input
              type="checkbox"
              checked={persistent}
              onChange={(e) => setPersistent(e.target.checked)}
            />
            {t('comments.markPersistent', 'Mark persistent')}
          </label>
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
          const cfStatus = getCustomFieldStatus(fd, val)
          return (
            <div key={fd.id} className={`field${cfStatus !== 'ok' ? ` field--${cfStatus}` : ''}`}
              style={cfStatus !== 'ok' ? {
                borderRadius: 'var(--radius-md)',
                padding: '4px 8px',
                backgroundColor: cfStatus === 'error' ? 'color-mix(in srgb, var(--color-error) 10%, transparent)' : 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
                border: `1px solid ${cfStatus === 'error' ? 'var(--color-error)' : 'var(--color-warning)'}`,
              } : undefined}
            >
              <label className="field__label" style={cfStatus !== 'ok' ? { color: cfStatus === 'error' ? 'var(--color-error)' : 'var(--color-warning)' } : undefined}>
                {fd.name}
                {fd.unit && <span className="text-subtle"> ({fd.unit})</span>}
                {cfStatus !== 'ok' && (
                  <span className="material-symbols-outlined icon-sm" style={{ marginLeft: 4, verticalAlign: 'middle', color: cfStatus === 'error' ? 'var(--color-error)' : 'var(--color-warning)', fontSize: 14 }}>
                    {cfStatus === 'error' ? 'error' : 'warning'}
                  </span>
                )}
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
  record, customFieldDefs, onOpenComments, onChange, refDate, diskTh, updateTh,
}: {
  record: DeviceRecord
  customFieldDefs: { id: string; name: string; unit: string | null; dataType: string }[]
  onOpenComments: () => void
  onChange: (recordId: string, patch: Record<string, unknown>) => void
  refDate: Date
  diskTh: ResolvedThreshold
  updateTh: ResolvedThreshold
}) {
  const { t } = useTranslation()
  const diskStatus = getCellStatus('diskFreeGB', record.diskFreeGB, refDate, diskTh)
  const updateStatus = getCellStatus('lastUpdateDate', record.lastUpdateDate, refDate, updateTh)
  const openCount = record.comments.filter((c) => !c.resolved).length

  // Look up this device's assigned custom field ids
  const deviceFieldIds = new Set((record.device.customFields ?? []).map((f) => f.id))

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

      {/* Custom fields — render proper input per type, disable if not assigned to this device */}
      {customFieldDefs.map((fd) => {
        const isAssigned = deviceFieldIds.has(fd.id)
        const val = isAssigned ? getCustomValue(fd.id) : ''
        const cfStatus = isAssigned ? getCustomFieldStatus(fd, val) : 'ok'

        if (!isAssigned) {
          return (
            <td key={fd.id} style={{ textAlign: 'center', color: 'var(--color-on-surface-muted)', opacity: 0.35 }}>
              <span title="Not applicable for this device">—</span>
            </td>
          )
        }

        if (fd.dataType === 'BOOLEAN') {
          return (
            <td key={fd.id} className={cfStatus !== 'ok' ? `cell--${cfStatus}` : ''} style={{ textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={val === 'true'}
                onChange={(e) => onChange(record.id, { customValues: { [fd.id]: String(e.target.checked) } })}
                style={{ accentColor: 'var(--color-primary)', width: 16, height: 16, cursor: 'pointer' }}
              />
            </td>
          )
        }

        if (fd.dataType === 'SELECT') {
          return (
            <td key={fd.id} className={cfStatus !== 'ok' ? `cell--${cfStatus}` : ''}>
              <div className="flex-center gap-1">
                <select
                  className="select"
                  style={{ fontSize: 12, padding: '2px 4px' }}
                  value={val}
                  onChange={(e) => onChange(record.id, { customValues: { [fd.id]: e.target.value } })}
                >
                  <option value="">—</option>
                  {JSON.parse(fd.selectOptions ?? '[]').map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {cfStatus !== 'ok' && (
                  <span className={`material-symbols-outlined icon-sm ${cfStatus === 'error' ? 'text-error' : ''}`}
                    style={cfStatus === 'warning' ? { color: 'var(--color-warning)' } : undefined}>
                    warning
                  </span>
                )}
              </div>
            </td>
          )
        }

        return (
          <td key={fd.id} className={cfStatus !== 'ok' ? `cell--${cfStatus}` : ''}>
            <div className="flex-center gap-1">
              <input
                className="table-input"
                type={fd.dataType === 'NUMBER' ? 'number' : fd.dataType === 'DATE' ? 'date' : 'text'}
                value={val}
                onChange={(e) =>
                  onChange(record.id, { customValues: { [fd.id]: e.target.value } })
                }
                placeholder="—"
              />
              {cfStatus !== 'ok' && (
                <span className={`material-symbols-outlined icon-sm ${cfStatus === 'error' ? 'text-error' : ''}`}
                  style={cfStatus === 'warning' ? { color: 'var(--color-warning)' } : undefined}>
                  warning
                </span>
              )}
            </div>
          </td>
        )
      })}

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

// ─── Ghost Row: previous month comparison ────────────────────────────────────
function GhostServerRow({
  record,
  customFieldDefs,
  label,
}: {
  record: DeviceRecord
  customFieldDefs: { id: string; name: string; unit: string | null; dataType: string }[]
  label: string
}) {
  const deviceFieldIds = new Set((record.device.customFields ?? []).map((f) => f.id))
  const getCV = (fieldId: string) =>
    record.customValues.find((v) => v.fieldDefId === fieldId)?.value ?? ''
  return (
    <tr style={{ opacity: 0.42, backgroundColor: 'var(--color-surface-container)', fontSize: 12, fontStyle: 'italic', borderLeft: '3px solid var(--color-outline-strong)', pointerEvents: 'none' }}>
      <td style={{ paddingLeft: 20, whiteSpace: 'nowrap', color: 'var(--color-on-surface-subtle)', fontSize: 10, fontStyle: 'normal', fontWeight: 600 }}>↳ {label}</td>
      <td />
      <td>{record.uptimeDays ?? '—'}</td>
      <td>{record.diskFreeGB != null ? record.diskFreeGB : '—'}</td>
      <td style={{ textAlign: 'center' }}>{record.eventlogsOk == null ? '—' : record.eventlogsOk ? '✓' : '✗'}</td>
      <td>{formatDateDDMMYYYY(record.lastUpdateDate)}</td>
      {customFieldDefs.map((fd) => (
        <td key={fd.id}>{deviceFieldIds.has(fd.id) ? (fd.dataType === 'BOOLEAN' ? (getCV(fd.id) === 'true' ? '✓' : '✗') : getCV(fd.id) || '—') : '—'}</td>
      ))}
      <td />
    </tr>
  )
}

// ─── Ghost Device Card: previous month comparison ────────────────────────────
function GhostDeviceCard({ record, label }: { record: DeviceRecord; label: string }) {
  const fieldDefs = record.device.customFields ?? []
  const getCV = (fieldId: string) =>
    record.customValues.find((v) => v.fieldDefId === fieldId)?.value ?? ''

  return (
    <div style={{
      opacity: 0.42,
      border: '1px solid var(--color-outline-strong)',
      borderLeft: '3px solid var(--color-outline-strong)',
      backgroundColor: 'var(--color-surface-container)',
      padding: 'var(--space-3) var(--space-4)',
      pointerEvents: 'none',
      fontStyle: 'italic',
      fontSize: 12,
    }}>
      <div style={{ fontSize: 10, fontStyle: 'normal', fontWeight: 600, color: 'var(--color-on-surface-subtle)', marginBottom: 4 }}>
        ↳ Previous: {label}
      </div>
      {fieldDefs.map((fd) => {
        const val = getCV(fd.id)
        return (
          <div key={fd.id} className="flex-between" style={{ marginBottom: 2 }}>
            <span style={{ color: 'var(--color-on-surface-muted)' }}>{fd.name}</span>
            <span style={{ fontFamily: fd.dataType === 'NUMBER' ? 'monospace' : undefined }}>
              {fd.dataType === 'BOOLEAN'
                ? (val === 'true' ? '✓' : '✗')
                : val || '—'}
              {fd.unit && <span style={{ color: 'var(--color-on-surface-muted)' }}> {fd.unit}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Unsaved Changes Dialog ───────────────────────────────────────────────────
function UnsavedDialog({ onSave, onDiscard, onCancel }: {
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="drawer-overlay" style={{ zIndex: 400 }} onClick={onCancel} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 401, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', width: 360, boxShadow: 'var(--shadow-xl)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-warning)', fontSize: 28 }}>warning</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Unsaved Changes</div>
            <div style={{ fontSize: 13, color: 'var(--color-on-surface-muted)', marginTop: 2 }}>
              You have unsaved changes. What would you like to do?
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn--ghost flex-1" onClick={onDiscard} style={{ color: 'var(--color-error)' }}>
            Discard
          </button>
          <button className="btn btn--ghost flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--primary flex-1" onClick={onSave}>
            <span className="material-symbols-outlined icon-sm">save</span>
            Save
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Main Sheet Page ──────────────────────────────────────────────────────────
const CATEGORIES: DeviceCategory[] = ['SERVER', 'NAS', 'FIREWALL', 'UPS', 'CUSTOM']

const CAT_LABEL_KEY = { NAS: 'nasDevices', FIREWALL: 'firewalls', UPS: 'ups', CUSTOM: 'custom' } as const
const CAT_ICON = { NAS: 'storage', FIREWALL: 'security', UPS: 'bolt', CUSTOM: 'devices' } as const

const FLAT_VIEW_KEY = 'maint_flat_additional_devices'

export default function MaintenanceSheet() {
  const { sheetId } = useParams<{ sheetId: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [sheet, setSheet] = useState<MonthlySheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<DeviceRecord | null>(null)
  const [flatView, setFlatView] = useState(() => localStorage.getItem(FLAT_VIEW_KEY) === 'true')
  const [pendingNav, setPendingNav] = useState<string | null>(null)
  const [hasAutoFilled, setHasAutoFilled] = useState(false)
  const [globalThresholds, setGlobalThresholds] = useState<GlobalThreshold[]>([])
  const [thresholdOverrides, setThresholdOverrides] = useState<ThresholdOverride[]>([])
  const [prevSheet, setPrevSheet] = useState<MonthlySheet | null>(null)
  const [showPrev, setShowPrev] = useState(false)
  const [loadingPrev, setLoadingPrev] = useState(false)
  const [dirtyTick, setDirtyTick] = useState(0)

  // Dirty tracking: recordId -> patch
  const dirty = useRef<Map<string, Record<string, unknown>>>(new Map())
  const hasDirty = () => dirty.current.size > 0

  const loadSheet = useCallback(async () => {
    if (!sheetId) return
    const s = await api.get<MonthlySheet>(`/sheets/${sheetId}`)
    setSheet(s)
    // Load thresholds + overrides in parallel now that we have the customerId
    const [th, ov] = await Promise.all([
      api.get<GlobalThreshold[]>('/config/thresholds'),
      api.get<ThresholdOverride[]>(`/config/overrides?customerId=${s.customerId}`),
    ])
    setGlobalThresholds(th)
    setThresholdOverrides(ov)
    setLoading(false)
  }, [sheetId])

  useEffect(() => { loadSheet() }, [loadSheet])

  const togglePrev = async () => {
    if (!sheet) return
    if (showPrev) { setShowPrev(false); return }
    if (!prevSheet) {
      setLoadingPrev(true)
      try {
        const pm = sheet.month === 1 ? 12 : sheet.month - 1
        const py = sheet.month === 1 ? sheet.year - 1 : sheet.year
        const resp = await api.get<{ sheetA: MonthlySheet | null }>(
          `/customers/${sheet.customerId}/compare?yearA=${py}&monthA=${pm}&yearB=${sheet.year}&monthB=${sheet.month}`
        )
        setPrevSheet(resp.sheetA)
      } catch { setPrevSheet(null) }
      finally { setLoadingPrev(false) }
    }
    setShowPrev(true)
  }

  // Auto-fill technicianName and maintenanceDate on first open
  useEffect(() => {
    if (!sheet || hasAutoFilled) return
    setHasAutoFilled(true)

    let needsPatch = false
    const patch: Partial<MonthlySheet> = {}

    if (!sheet.technicianName && user) {
      patch.technicianName = user.displayName ?? user.username
      needsPatch = true
    }
    if (!sheet.maintenanceDate) {
      patch.maintenanceDate = new Date().toISOString().slice(0, 10)
      needsPatch = true
    }

    if (needsPatch) {
      setSheet((prev) => prev ? { ...prev, ...patch } : prev)
      api.patch(`/sheets/${sheet.id}`, patch).catch(console.error)
    }
  }, [sheet, hasAutoFilled, user])

  // Persist flat view preference
  useEffect(() => {
    localStorage.setItem(FLAT_VIEW_KEY, String(flatView))
  }, [flatView])

  // Unsaved changes: intercept browser back/close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirty()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

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
    setDirtyTick((v) => v + 1)
  }, [])

  const handleSheetUpdate = async (patch: Partial<MonthlySheet>) => {
    setSheet(prev => prev ? { ...prev, ...patch } : prev)
    await api.patch(`/sheets/${sheet!.id}`, patch)
  }

  const doSaveAll = async (recordIds?: string[]) => {
    const entries = Array.from(dirty.current.entries())
    const filtered = recordIds
      ? entries.filter(([recordId]) => recordIds.includes(recordId))
      : entries
    if (filtered.length === 0) return
    setSaving(true)
    setSaved(false)
    try {
      const records = filtered.map(([recordId, patch]) => ({
        recordId,
        ...patch,
      }))
      await api.post('/records/batch', { records })
      for (const [recordId] of filtered) dirty.current.delete(recordId)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      const refreshed = await api.get<MonthlySheet>(`/sheets/${sheetId}`)
      setSheet(refreshed)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAll = async () => {
    await doSaveAll()
  }

  useEffect(() => {
    if (!sheetId || dirty.current.size === 0) return
    const timeout = window.setTimeout(() => {
      const ids = Array.from(dirty.current.keys())
      void doSaveAll(ids)
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [dirtyTick, sheetId])

  // Navigation guard: intercept react-router navigate
  const guardedNavigate = (to: string) => {
    if (hasDirty()) {
      setPendingNav(to)
    } else {
      navigate(to)
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

  const refDate = getRefDate(sheet)
  const monthName = t(`months.${sheet.month}` as Parameters<typeof t>[0])
  const recordsByCategory = (cat: DeviceCategory) =>
    sheet.deviceRecords?.filter((r) => r.device.category === cat) ?? []

  // Collect all server-level custom field defs (union of all server records, with full def including dataType)
  const serverCustomFields = Array.from(
    new Map(
      (sheet.deviceRecords ?? [])
        .filter((r) => r.device.category === 'SERVER')
        .flatMap((r) => r.device.customFields ?? [])
        .map((fd) => [fd.id, fd]),
    ).values(),
  )

  const nonServerCategories: DeviceCategory[] = ['NAS', 'FIREWALL', 'UPS', 'CUSTOM']
  const allNonServerRecords = nonServerCategories.flatMap(cat => recordsByCategory(cat))

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
              onChange={(e) => {
                const value = e.target.value
                setSheet((s) => s ? { ...s, technicianName: value } : s)
                void handleSheetUpdate({ technicianName: value || null })
              }}
              placeholder={t('sheet.technicianPlaceholder', 'Who checked the servers?')}
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150, maxWidth: 200 }}>
            <label className="field__label">{t('sheet.maintenanceDate', 'Maintenance Date')}</label>
            <input 
              className="input" 
              type="date" 
              value={sheet.maintenanceDate ?? ''}
              onChange={(e) => {
                const value = e.target.value
                setSheet((s) => s ? { ...s, maintenanceDate: value } : s)
                void handleSheetUpdate({ maintenanceDate: value || null })
              }}
            />
          </div>
        </div>

        <div className="page-header__actions">
          {/* Compare with previous month */}
          <button
            className={`btn btn--sm ${showPrev ? 'btn--secondary' : 'btn--ghost'}`}
            onClick={togglePrev}
            disabled={loadingPrev}
            title={showPrev ? t('sheet.hideComparePrev', 'Hide previous month') : t('sheet.comparePrev', 'Compare previous month')}
          >
            {loadingPrev
              ? <span className="spinner spinner--sm" />
              : <span className="material-symbols-outlined icon-sm">compare</span>}
            {showPrev ? t('sheet.hideComparePrev', 'Hide prev. month') : t('sheet.comparePrev', 'Compare prev. month')}
          </button>

          {/* Flat/grouped view toggle for additional devices */}
          {allNonServerRecords.length > 0 && (
            <button
              className={`btn btn--ghost btn--sm`}
              title={flatView ? 'Show grouped by type' : 'Show all devices in flat list'}
              onClick={() => setFlatView(v => !v)}
              style={{ marginRight: 8 }}
            >
              <span className="material-symbols-outlined icon-sm">
                {flatView ? 'view_agenda' : 'view_list'}
              </span>
              {flatView ? 'Grouped' : 'Flat List'}
            </button>
          )}
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
                {recordsByCategory('SERVER').map((record) => {
                  const prevRecord = showPrev
                    ? prevSheet?.deviceRecords?.find((r) => r.deviceId === record.deviceId)
                    : undefined
                  const prevLabel = prevSheet
                    ? `${t(`months.${prevSheet.month}` as Parameters<typeof t>[0])} ${prevSheet.year}`
                    : ''
                  return (
                    <>
                      <ServerRow
                        key={record.id}
                        record={record}
                        customFieldDefs={serverCustomFields}
                        onOpenComments={() => setDrawerRecord(record)}
                        onChange={handleChange}
                        refDate={refDate}
                        diskTh={resolveThreshold('diskFreeGB', record.deviceId, globalThresholds, thresholdOverrides)}
                        updateTh={resolveThreshold('lastUpdateDate', record.deviceId, globalThresholds, thresholdOverrides)}
                      />
                      {prevRecord && (
                        <GhostServerRow
                          key={`ghost-${record.id}`}
                          record={prevRecord}
                          customFieldDefs={serverCustomFields}
                          label={prevLabel}
                        />
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Other device categories ── */}
      {flatView && allNonServerRecords.length > 0 ? (
        // Flat view: all non-server devices side by side in a single grid
        <section className="section">
          <div className="section__header">
            <span className="material-symbols-outlined">devices</span>
            <h2 className="section-title">Additional Devices</h2>
            <span className="badge badge--neutral" style={{ marginLeft: 'auto' }}>
              {allNonServerRecords.length}
            </span>
          </div>
          <div className="grid-2">
            {allNonServerRecords.map((record) => {
              const prevRecord = showPrev
                ? prevSheet?.deviceRecords?.find((r) => r.deviceId === record.deviceId)
                : undefined
              const prevLabel = prevSheet
                ? `${t(`months.${prevSheet.month}` as Parameters<typeof t>[0])} ${prevSheet.year}`
                : ''
              return (
                <>
                  <DeviceCard
                    key={record.id}
                    record={record}
                    onOpenComments={() => setDrawerRecord(record)}
                    onChange={handleChange}
                  />
                  {prevRecord && (
                    <GhostDeviceCard
                      key={`ghost-${record.id}`}
                      record={prevRecord}
                      label={prevLabel}
                    />
                  )}
                </>
              )
            })}
          </div>
        </section>
      ) : (
        // Grouped view (default)
        nonServerCategories.map((cat) => {
          const records = recordsByCategory(cat)
          if (records.length === 0) return null
          const sectionKey = CAT_LABEL_KEY[cat as keyof typeof CAT_LABEL_KEY]
          const icon = CAT_ICON[cat as keyof typeof CAT_ICON]

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
                {records.map((record) => {
                  const prevRecord = showPrev
                    ? prevSheet?.deviceRecords?.find((r) => r.deviceId === record.deviceId)
                    : undefined
                  const prevLabel = prevSheet
                    ? `${t(`months.${prevSheet.month}` as Parameters<typeof t>[0])} ${prevSheet.year}`
                    : ''
                  return (
                    <>
                      <DeviceCard
                        key={record.id}
                        record={record}
                        onOpenComments={() => setDrawerRecord(record)}
                        onChange={handleChange}
                      />
                      {prevRecord && (
                        <GhostDeviceCard
                          key={`ghost-${record.id}`}
                          record={prevRecord}
                          label={prevLabel}
                        />
                      )}
                    </>
                  )
                })}
              </div>
            </section>
          )
        })
      )}

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

      {/* Unsaved changes dialog */}
      {pendingNav && (
        <UnsavedDialog
          onSave={async () => {
            await doSaveAll()
            navigate(pendingNav)
          }}
          onDiscard={() => {
            dirty.current.clear()
            navigate(pendingNav)
          }}
          onCancel={() => setPendingNav(null)}
        />
      )}
    </div>
  )
}
