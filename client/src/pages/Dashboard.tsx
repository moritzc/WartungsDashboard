import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../hooks/useApi'
import { useAuthStore } from '../stores/useAuthStore'
import type { Customer } from '../types'

const NOW = new Date()
const CURRENT_YEAR = NOW.getFullYear()
const CURRENT_MONTH = NOW.getMonth() + 1

function getStatusClass(errors: number, warnings: number) {
  if (errors > 0) return 'customer-card--error'
  if (warnings > 0) return 'customer-card--warning'
  return 'customer-card--ok'
}

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    api.get<Customer[]>('/customers')
      .then(setCustomers)
      .finally(() => setLoading(false))
  }, [])

  const monthLabel = (y: number, m: number) => {
    const month = t(`months.${m}` as Parameters<typeof t>[0])
    return `${month} ${y}`
  }

  const openOrCreateSheet = async (customerId: string) => {
    const sheet = await api.post<{ id: string }>(`/customers/${customerId}/sheets`, {
      year: selectedYear,
      month: selectedMonth,
    })
    navigate(`/sheet/${sheet.id}`)
  }

  if (loading) {
    return (
      <div className="page loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header flex-wrap" style={{ gap: '1rem', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-subtitle">
            {t('dashboard.subtitle', { month: monthLabel(selectedYear, selectedMonth) })}
          </p>
        </div>
        
        <div className="flex-center gap-4 ml-auto" style={{ flexWrap: 'wrap' }}>
          <div className="flex gap-2">
            <select className="select" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {[CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select className="select" value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i + 1} value={i + 1}>{t(`months.${i + 1}` as Parameters<typeof t>[0])}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-1" style={{ backgroundColor: 'var(--color-surface)', padding: '4px', borderRadius: '4px' }}>
            <button className={`btn btn--ghost btn--icon btn--sm ${viewMode === 'grid' ? 'bg-surface-hover' : ''}`} onClick={() => setViewMode('grid')}>
              <span className="material-symbols-outlined icon-sm">grid_view</span>
            </button>
            <button className={`btn btn--ghost btn--icon btn--sm ${viewMode === 'list' ? 'bg-surface-hover' : ''}`} onClick={() => setViewMode('list')}>
              <span className="material-symbols-outlined icon-sm">list</span>
            </button>
          </div>

          {isAdmin && (
            <button className="btn btn--primary" onClick={() => navigate('/customers')}>
              <span className="material-symbols-outlined icon-sm">add</span>
              {t('customers.add')}
            </button>
          )}
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">groups</span>
          <p>{t('dashboard.noCustomers')}</p>
          {isAdmin && <p className="text-muted">{t('dashboard.addFirstCustomer')}</p>}
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid-3' : 'flex flex-col gap-3'}>
          {customers.filter((c) => c.isActive).map((customer) => {
            const lastSheet = customer.monthlySheets?.[0]
            const currentSheet = customer.monthlySheets?.find(
              (s) => s.year === selectedYear && s.month === selectedMonth,
            )

            const deviceCount = customer._count?.devices ?? 0

            if (viewMode === 'list') {
              return (
                <div
                  key={customer.id}
                  className={`card flex-center padding-3 cursor-pointer hover-lift`}
                  style={{ gap: '1rem', borderLeft: '4px solid var(--color-primary)' }}
                  onClick={() => openOrCreateSheet(customer.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && openOrCreateSheet(customer.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{customer.name}</div>
                    <div className="text-subtle" style={{ fontSize: 13 }}>
                      {deviceCount} {t('dashboard.devices')}
                      {customer.notes && ` · ${customer.notes}`}
                    </div>
                  </div>
                  <div>
                    <span className={`badge ${currentSheet ? 'badge--info' : 'badge--neutral'}`}>
                      {currentSheet
                        ? t(`common.${currentSheet.status.toLowerCase()}` as Parameters<typeof t>[0])
                        : monthLabel(selectedYear, selectedMonth)}
                    </span>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={customer.id}
                className={`customer-card ${getStatusClass(0, 0)}`}
                onClick={() => openOrCreateSheet(customer.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && openOrCreateSheet(customer.id)}
              >
                <div className="customer-card__name">{customer.name}</div>
                <div className="customer-card__meta">
                  {deviceCount} {t('dashboard.devices')}
                  {customer.notes && ` · ${customer.notes}`}
                </div>

                <div className="customer-card__stats">
                  <div>
                    <div className="label">{t('dashboard.lastSheet')}</div>
                    <div style={{ marginTop: 2 }}>
                      {lastSheet
                        ? monthLabel(lastSheet.year, lastSheet.month)
                        : '—'}
                    </div>
                  </div>

                  <div style={{ marginLeft: 'auto' }}>
                    <span
                      className={`badge ${currentSheet ? 'badge--info' : 'badge--neutral'}`}
                    >
                      {currentSheet
                        ? t(`common.${currentSheet.status.toLowerCase()}` as Parameters<typeof t>[0])
                        : monthLabel(selectedYear, selectedMonth)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
