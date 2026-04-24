import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import type { Customer, MonthlySheet, Comment, CommentSeverity, DeviceRecord } from '../types'
import { formatDateDDMMYYYY } from '../utils/date'

const SEVERITIES: CommentSeverity[] = ['INFO', 'WARNING', 'CRITICAL']

// ─── Monthly Comparison View ──────────────────────────────────────────────────
function CompareView({ customerId, customers }: { customerId: string; customers: Customer[] }) {
  const { t } = useTranslation()
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [yearA, setYearA] = useState(now.getFullYear())
  const [monthA, setMonthA] = useState(previous.getMonth() + 1)
  const [yearB, setYearB] = useState(now.getFullYear())
  const [monthB, setMonthB] = useState(now.getMonth() + 1) // current month
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ sheetA: MonthlySheet | null; sheetB: MonthlySheet | null } | null>(null)

  const customer = customers.find((c) => c.id === customerId)

  const doCompare = async () => {
    if (!customerId || customerId === 'ALL') return
    setLoading(true)
    try {
      const data = await api.get<{ sheetA: MonthlySheet | null; sheetB: MonthlySheet | null }>(
        `/customers/${customerId}/compare?yearA=${yearA}&monthA=${monthA}&yearB=${yearB}&monthB=${monthB}`
      )
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  const getVal = (record: DeviceRecord | undefined, field: string): string => {
    if (!record) return '—'
    switch (field) {
      case 'uptimeDays': return record.uptimeDays != null ? String(record.uptimeDays) : '—'
      case 'diskFreeGB': return record.diskFreeGB != null ? `${record.diskFreeGB} GB` : '—'
      case 'eventlogsOk': return record.eventlogsOk == null ? '—' : record.eventlogsOk ? '✓ OK' : '✗ Issues'
      case 'lastUpdateDate': return formatDateDDMMYYYY(record.lastUpdateDate)
      default: return '—'
    }
  }

  const getCustomVal = (record: DeviceRecord | undefined, fieldDefId: string): string => {
    if (!record) return '—'
    return record.customValues?.find((v) => v.fieldDefId === fieldDefId)?.value ?? '—'
  }

  const valueChanged = (a: string, b: string) => a !== b && a !== '—' && b !== '—'
  const monthLabel = (y: number, m: number) => `${t(`months.${m}` as Parameters<typeof t>[0])} ${y}`

  // Collect all devices across both sheets
  const allDevices = new Map<string, { name: string; category: string }>()
  for (const r of result?.sheetA?.deviceRecords ?? []) {
    allDevices.set(r.deviceId, { name: r.device.name, category: r.device.category })
  }
  for (const r of result?.sheetB?.deviceRecords ?? []) {
    allDevices.set(r.deviceId, { name: r.device.name, category: r.device.category })
  }

  // Collect all custom field defs across both sheets
  const allCustomFields = new Map<string, { name: string; unit: string | null }>()
  for (const r of [...(result?.sheetA?.deviceRecords ?? []), ...(result?.sheetB?.deviceRecords ?? [])]) {
    for (const cv of r.device.customFields ?? []) {
      allCustomFields.set(cv.id, { name: cv.name, unit: cv.unit })
    }
  }
  const standardFields = ['uptimeDays', 'diskFreeGB', 'eventlogsOk', 'lastUpdateDate']
  const standardLabels: Record<string, string> = {
    uptimeDays: t('sheet.uptime'),
    diskFreeGB: t('sheet.diskFree'),
    eventlogsOk: t('sheet.eventlogs'),
    lastUpdateDate: t('sheet.lastUpdate'),
  }

  return (
    <div>
      {/* Compare controls */}
      <div className="card mb-6">
        <div className="flex-center gap-4" style={{ flexWrap: 'wrap' }}>
          {/* Period A */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              {t('reporting.periodA', 'Periode A')}
            </div>
            <div className="flex gap-2">
              <select className="select" value={yearA} onChange={(e) => setYearA(Number(e.target.value))}>
                {[0, 1, 2, 3].map((offset) => {
                  const y = new Date().getFullYear() - offset
                  return <option key={y} value={y}>{y}</option>
                })}
              </select>
              <select className="select" value={monthA} onChange={(e) => setMonthA(Number(e.target.value))}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>{t(`months.${i + 1}` as Parameters<typeof t>[0])}</option>
                ))}
              </select>
            </div>
          </div>

          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--color-on-surface-muted)', flexShrink: 0 }}>compare_arrows</span>

          {/* Period B */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              {t('reporting.periodB', 'Periode B')}
            </div>
            <div className="flex gap-2">
              <select className="select" value={yearB} onChange={(e) => setYearB(Number(e.target.value))}>
                {[0, 1, 2, 3].map((offset) => {
                  const y = new Date().getFullYear() - offset
                  return <option key={y} value={y}>{y}</option>
                })}
              </select>
              <select className="select" value={monthB} onChange={(e) => setMonthB(Number(e.target.value))}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>{t(`months.${i + 1}` as Parameters<typeof t>[0])}</option>
                ))}
              </select>
            </div>
          </div>

          <button className="btn btn--primary" onClick={doCompare} disabled={loading || !customerId || customerId === 'ALL'} style={{ alignSelf: 'flex-end' }}>
            {loading ? <span className="spinner spinner--sm" /> : <span className="material-symbols-outlined icon-sm">compare</span>}
            {t('reporting.compare', 'Vergleichen')}
          </button>
        </div>
        {(!customerId || customerId === 'ALL') && (
          <div className="info-banner mt-4">
            <span className="material-symbols-outlined icon-sm">info</span>
            <span>{t('reporting.selectCustomerHint', 'Bitte einen Kunden auswählen, um die Vergleichsansicht zu nutzen.')}</span>
          </div>
        )}
      </div>

      {/* Comparison table */}
      {result && (
        <>
          {/* Summary badges */}
          <div className="flex-center gap-4 mb-4">
            <div>
              <span className="badge badge--info">{monthLabel(yearA, monthA)}</span>
              {!result.sheetA && <span className="badge badge--neutral" style={{ marginLeft: 8 }}>{t('reporting.noData', 'Keine Daten')}</span>}
            </div>
            <span style={{ color: 'var(--color-on-surface-muted)', fontSize: 20 }}>vs</span>
            <div>
              <span className="badge badge--info">{monthLabel(yearB, monthB)}</span>
              {!result.sheetB && <span className="badge badge--neutral" style={{ marginLeft: 8 }}>{t('reporting.noData', 'Keine Daten')}</span>}
            </div>
            <span className="badge badge--neutral" style={{ marginLeft: 'auto' }}>
              {customer?.name}
            </span>
          </div>

          {allDevices.size === 0 ? (
            <div className="empty-state">
              <span className="material-symbols-outlined">search_off</span>
              <p>{t('reporting.noDeviceRecords', 'Keine Gerätedaten für diesen Zeitraum gefunden.')}</p>
            </div>
          ) : (
            Array.from(allDevices.entries()).map(([deviceId, info]) => {
              const recA = result.sheetA?.deviceRecords?.find((r) => r.deviceId === deviceId)
              const recB = result.sheetB?.deviceRecords?.find((r) => r.deviceId === deviceId)

              // Custom fields relevant to this device
              const deviceCustomFields = Array.from(allCustomFields.entries()).filter(([fieldId]) => {
                return (recA?.device.customFields ?? recB?.device.customFields ?? []).some((f) => f.id === fieldId)
              })

              const rows = [
                ...standardFields.map((f) => {
                  const a = getVal(recA, f)
                  const b = getVal(recB, f)
                  return { label: standardLabels[f], a, b, changed: valueChanged(a, b) }
                }),
                ...deviceCustomFields.map(([fieldId, fd]) => {
                  const a = getCustomVal(recA, fieldId)
                  const b = getCustomVal(recB, fieldId)
                  return {
                    label: `${fd.name}${fd.unit ? ` (${fd.unit})` : ''}`,
                    a, b, changed: valueChanged(a, b),
                  }
                }),
              ].filter((r) => r.a !== '—' || r.b !== '—')

              const changedCount = rows.filter((r) => r.changed).length

              return (
                <div key={deviceId} className="card mb-4">
                  <div className="card__header">
                    <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="material-symbols-outlined icon-sm">
                        {info.category === 'SERVER' ? 'dns' : info.category === 'NAS' ? 'storage' : info.category === 'FIREWALL' ? 'security' : info.category === 'UPS' ? 'bolt' : 'devices'}
                      </span>
                      {info.name}
                    </div>
                    <div className="flex gap-2">
                      {changedCount > 0 ? (
                        <span className="badge badge--warning">
                          <span className="material-symbols-outlined icon-sm">change_history</span>
                          {changedCount} change{changedCount > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="badge badge--ok">No changes</span>
                      )}
                      {!recA && <span className="badge badge--neutral">New in B</span>}
                      {!recB && <span className="badge badge--neutral">Removed in B</span>}
                    </div>
                  </div>

                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 160 }}>Field</th>
                        <th>{monthLabel(yearA, monthA)}</th>
                        <th>{monthLabel(yearB, monthB)}</th>
                        <th style={{ width: 80 }}>Changed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} style={row.changed ? { backgroundColor: 'var(--color-warning-bg)' } : undefined}>
                          <td className="text-muted" style={{ fontSize: 12 }}>{row.label}</td>
                          <td style={{ fontFamily: row.changed ? 'monospace' : undefined }}>{row.a}</td>
                          <td style={{ fontFamily: row.changed ? 'monospace' : undefined, fontWeight: row.changed ? 600 : undefined }}>{row.b}</td>
                          <td style={{ textAlign: 'center' }}>
                            {row.changed && (
                              <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--color-warning)' }}>
                                change_history
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Reporting Page ──────────────────────────────────────────────────────
export default function Reporting() {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('ALL')
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [fromYear, setFromYear] = useState<number>(new Date().getFullYear())
  const [fromMonth, setFromMonth] = useState<number>(new Date().getMonth() + 1)
  const [toYear, setToYear] = useState<number>(new Date().getFullYear())
  const [toMonth, setToMonth] = useState<number>(new Date().getMonth() + 1)
  const [useRange, setUseRange] = useState(false)
  const [severityFilter, setSeverityFilter] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [openOnly, setOpenOnly] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'comments' | 'compare'>('comments')

  // Persist selected customer in session
  useEffect(() => {
    const saved = sessionStorage.getItem('reporting_customer')
    if (saved) setSelectedCustomerId(saved)
    const savedTab = sessionStorage.getItem('reporting_tab') as 'comments' | 'compare' | null
    if (savedTab) setActiveTab(savedTab)
  }, [])

  useEffect(() => {
    api.get<Customer[]>('/customers').then(setCustomers)
  }, [])

  useEffect(() => {
    sessionStorage.setItem('reporting_customer', selectedCustomerId)
  }, [selectedCustomerId])

  useEffect(() => {
    sessionStorage.setItem('reporting_tab', activeTab)
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'comments') return
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedCustomerId) params.set('customerId', selectedCustomerId)
    if (useRange) {
      params.set('fromYear', fromYear.toString())
      params.set('fromMonth', fromMonth.toString())
      params.set('toYear', toYear.toString())
      params.set('toMonth', toMonth.toString())
    } else {
      params.set('year', selectedYear.toString())
      params.set('month', selectedMonth.toString())
    }
    if (severityFilter) params.set('severity', severityFilter)
    if (!showResolved || openOnly) params.set('resolved', 'false')
    
    api.get<Comment[]>(`/comments/export?${params}`)
      .then(setComments)
      .finally(() => setLoading(false))
  }, [selectedCustomerId, selectedYear, selectedMonth, severityFilter, showResolved, activeTab, useRange, fromYear, fromMonth, toYear, toMonth, openOnly])

  const customer = customers.find((c) => c.id === selectedCustomerId)
  const monthLabel = `${t(`months.${selectedMonth}` as Parameters<typeof t>[0])} ${selectedYear}`
  const rangeLabel = `${t(`months.${fromMonth}` as Parameters<typeof t>[0])} ${fromYear} - ${t(`months.${toMonth}` as Parameters<typeof t>[0])} ${toYear}`

  // Group components by Customer Name -> Device Name
  type GroupData = Record<string, Record<string, { deviceName: string; category: string; items: Comment[] }>>
  const grouped = comments.reduce<GroupData>(
    (acc, c) => {
      const custName = c.record?.sheet?.customer?.name ?? t('common.unknown')
      const dId = c.record?.device.id ?? 'unknown'
      if (!acc[custName]) acc[custName] = {}
      if (!acc[custName][dId]) {
        acc[custName][dId] = {
          deviceName: c.record?.device.name ?? t('common.unknown'),
          category: c.record?.device.category ?? '',
          items: [],
        }
      }
      acc[custName][dId].items.push(c)
      return acc
    },
    {}
  )

  const criticalCount = comments.filter((c) => c.severity === 'CRITICAL').length
  const openCount = comments.filter((c) => !c.resolved).length

  const loadPreviousMonthSummary = () => {
    const base = new Date(selectedYear, selectedMonth - 1, 1)
    const prev = new Date(base.getFullYear(), base.getMonth() - 1, 1)
    setUseRange(false)
    setSelectedYear(prev.getFullYear())
    setSelectedMonth(prev.getMonth() + 1)
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('reporting.title')}</h1>
          <p className="page-subtitle">
            {t('reporting.subtitle', { customer: customer ? customer.name : t('reporting.allCustomers'), month: monthLabel })}
          </p>
        </div>
        <div className="page-header__actions">
          {activeTab === 'comments' && (
            <button className="btn btn--primary" onClick={() => window.print()}>
              <span className="material-symbols-outlined icon-sm">picture_as_pdf</span>
              {t('reporting.exportPdf')}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-6)' }}>
        {(['comments', 'compare'] as const).map((tab) => (
          <button
            key={tab}
            className="btn btn--ghost"
            style={{
              borderRadius: 0,
              borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--color-primary)' : undefined,
              marginBottom: -1,
            }}
            onClick={() => setActiveTab(tab)}
          >
            <span className="material-symbols-outlined icon-sm">
              {tab === 'comments' ? 'chat_bubble_outline' : 'compare_arrows'}
            </span>
            {tab === 'comments' ? t('reporting.activityComments', 'Activity Comments') : t('reporting.compareMonths', 'Compare Months')}
          </button>
        ))}
      </div>

      {/* Customer filter (shared between tabs) */}
      <div className="card mb-6">
        <div className="grid-4" style={{ gap: 'var(--space-4)' }}>
          <div className="field">
            <label className="field__label">{t('reporting.selectCustomer')}</label>
            <select
              className="select"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
            >
              {activeTab === 'comments' && (
                <option value="ALL">{t('reporting.allCustomers', 'All Customers')}</option>
              )}
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Month/year filters for comments tab */}
          {activeTab === 'comments' && (
            <>
              <div className="field">
                <label className="field__label">{t('common.year', 'Year')}</label>
                <select
                  className="select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {[0, 1, 2, 3].map((offset) => {
                    const y = new Date().getFullYear() - offset
                    return <option key={y} value={y}>{y}</option>
                  })}
                </select>
              </div>

              <div className="field">
                <label className="field__label">{t('reporting.selectMonth')}</label>
                <select
                  className="select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>{t(`months.${i + 1}` as Parameters<typeof t>[0])}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label">&nbsp;</label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} />
                  {t('reporting.useRange', 'Use timespan')}
                </label>
              </div>

              {useRange && (
                <>
                  <div className="field">
                    <label className="field__label">{t('reporting.from', 'From')}</label>
                    <div className="flex gap-2">
                      <select className="select" value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))}>
                        {[0, 1, 2, 3].map((offset) => {
                          const y = new Date().getFullYear() - offset
                          return <option key={y} value={y}>{y}</option>
                        })}
                      </select>
                      <select className="select" value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))}>
                        {Array.from({ length: 12 }).map((_, i) => (
                          <option key={i + 1} value={i + 1}>{t(`months.${i + 1}` as Parameters<typeof t>[0])}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label className="field__label">{t('reporting.to', 'To')}</label>
                    <div className="flex gap-2">
                      <select className="select" value={toYear} onChange={(e) => setToYear(Number(e.target.value))}>
                        {[0, 1, 2, 3].map((offset) => {
                          const y = new Date().getFullYear() - offset
                          return <option key={y} value={y}>{y}</option>
                        })}
                      </select>
                      <select className="select" value={toMonth} onChange={(e) => setToMonth(Number(e.target.value))}>
                        {Array.from({ length: 12 }).map((_, i) => (
                          <option key={i + 1} value={i + 1}>{t(`months.${i + 1}` as Parameters<typeof t>[0])}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div className="field">
                <label className="field__label">{t('reporting.filterSeverity')}</label>
                <select className="select" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                  <option value="">{t('reporting.allSeverities')}</option>
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="field">
                <label className="field__label">&nbsp;</label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={showResolved}
                    onChange={(e) => setShowResolved(e.target.checked)}
                  />
                  {t('reporting.showResolved')}
                </label>
              </div>
              <div className="field">
                <label className="field__label">&nbsp;</label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
                  {t('reporting.openTasksOnly', 'Open tasks only')}
                </label>
              </div>
            </>
          )}
        </div>
        {activeTab === 'comments' && (
          <div className="flex gap-2 mt-4">
            <button className="btn btn--ghost btn--sm" onClick={loadPreviousMonthSummary}>
              <span className="material-symbols-outlined icon-sm">summarize</span>
              {t('reporting.prevMonthSummary', 'Summary of all comments from previous month')}
            </button>
          </div>
        )}
      </div>

      {activeTab === 'compare' ? (
        <CompareView customerId={selectedCustomerId} customers={customers} />
      ) : (
        <>
          {/* Summary bar */}
          {comments.length > 0 && (
            <div className="flex-center gap-4 mb-6">
              <span className="badge badge--neutral">
                {t('reporting.totalComments', { count: comments.length })} · {useRange ? rangeLabel : monthLabel}
              </span>
              <span className="badge badge--neutral">{t('reporting.openCount', { count: openCount })}</span>
              {criticalCount > 0 && (
                <span className="badge badge--critical">
                  <span className="material-symbols-outlined icon-sm">error</span>
                  {t('reporting.criticalCount', { count: criticalCount })}
                </span>
              )}
            </div>
          )}

          {/* Report content */}
          {loading ? (
            <div className="loading-screen"><div className="spinner" /></div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="empty-state">
              <span className="material-symbols-outlined">chat_bubble_outline</span>
              <p>{t('reporting.noComments')}</p>
            </div>
          ) : (
            Object.entries(grouped).map(([customerName, devices]) => (
              <div key={customerName} className="mb-6">
                <h2 className="section-title mb-4" style={{ fontSize: 18, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                  {customerName}
                </h2>
                {Object.entries(devices).map(([, group]) => (
                  <div key={group.deviceName} className="card mb-4">
                    <div className="card__header">
                      <div>
                        <div className="card__title">
                          <span className="material-symbols-outlined icon-sm" style={{ marginRight: 6 }}>
                            {group.category === 'SERVER' ? 'dns'
                              : group.category === 'NAS' ? 'storage'
                              : group.category === 'FIREWALL' ? 'security'
                              : group.category === 'UPS' ? 'bolt'
                              : 'devices'}
                          </span>
                          {group.deviceName}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {(group.items.filter((i) => i.severity === 'CRITICAL').length > 0) && (
                          <span className="badge badge--critical">
                            {group.items.filter((i) => i.severity === 'CRITICAL').length} Critical
                          </span>
                        )}
                        {(group.items.filter((i) => i.severity === 'WARNING').length > 0) && (
                          <span className="badge badge--warning">
                            {group.items.filter((i) => i.severity === 'WARNING').length} Warning
                          </span>
                        )}
                      </div>
                    </div>

                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 120 }}>{t('reporting.timestamp')}</th>
                          <th>{t('reporting.comment')}</th>
                          <th style={{ width: 100 }}>{t('reporting.severity')}</th>
                          <th style={{ width: 100 }}>{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((c) => (
                          <tr key={c.id} style={c.resolved ? { opacity: 0.6 } : undefined}>
                            <td className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                              {formatDateDDMMYYYY(c.createdAt)}
                            </td>
                            <td>{c.text}</td>
                            <td>
                              <span
                                className={`badge ${
                                  c.severity === 'CRITICAL' ? 'badge--critical'
                                  : c.severity === 'WARNING' ? 'badge--warning'
                                  : 'badge--neutral'
                                }`}
                              >
                                {c.severity}
                              </span>
                            </td>
                            <td>
                              {c.resolved ? (
                                <span className="badge badge--ok">
                                  <span className="material-symbols-outlined icon-sm">check</span>
                                  {t('common.resolved')}
                                </span>
                              ) : (
                                <span className="badge badge--neutral">{t('common.open')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
