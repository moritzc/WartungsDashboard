import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import type { Customer, MonthlySheet, Comment, CommentSeverity } from '../types'

const SEVERITIES: CommentSeverity[] = ['INFO', 'WARNING', 'CRITICAL']

export default function Reporting() {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('ALL')
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [severityFilter, setSeverityFilter] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get<Customer[]>('/customers').then(setCustomers)
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedCustomerId) params.set('customerId', selectedCustomerId)
    params.set('year', selectedYear.toString())
    params.set('month', selectedMonth.toString())
    if (severityFilter) params.set('severity', severityFilter)
    if (!showResolved) params.set('resolved', 'false')
    
    api.get<Comment[]>(`/comments/export?${params}`)
      .then(setComments)
      .finally(() => setLoading(false))
  }, [selectedCustomerId, selectedYear, selectedMonth, severityFilter, showResolved])

  const customer = customers.find((c) => c.id === selectedCustomerId)
  const monthLabel = `${t(`months.${selectedMonth}` as Parameters<typeof t>[0])} ${selectedYear}`

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
          <button className="btn btn--primary" onClick={() => window.print()}>
            <span className="material-symbols-outlined icon-sm">picture_as_pdf</span>
            {t('reporting.exportPdf')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid-4" style={{ gap: 'var(--space-4)' }}>
          <div className="field">
            <label className="field__label">{t('reporting.selectCustomer')}</label>
            <select
              className="select"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
            >
              <option value="ALL">{t('reporting.allCustomers', 'All Customers')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

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
        </div>
      </div>

      {/* Summary bar */}
      {comments.length > 0 && (
        <div className="flex-center gap-4 mb-6">
          <span className="badge badge--neutral">
            {t('reporting.totalComments', { count: comments.length })}
          </span>
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
                          {new Date(c.createdAt).toLocaleDateString()}
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
    </div>
  )
}
