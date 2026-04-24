// Shared TypeScript types across client

export type UserRole = 'ADMIN' | 'VIEWER'
export type DeviceCategory = 'SERVER' | 'NAS' | 'FIREWALL' | 'UPS' | 'CUSTOM'
export type SheetStatus = 'DRAFT' | 'COMPLETE'
export type RecordStatus = 'OK' | 'WARNING' | 'ERROR'
export type CommentSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
export type FieldDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT'

export interface User {
  id: string
  username: string
  displayName: string | null
  role: UserRole
  isActive?: boolean
  createdAt?: string
}

export interface Customer {
  id: string
  name: string
  slug: string
  notes: string | null
  isActive: boolean
  createdAt: string
  _count?: { devices: number }
  monthlySheets?: MonthlySheet[]
}

export interface Device {
  id: string
  customerId: string
  name: string
  hostname: string | null
  category: DeviceCategory
  isActive: boolean
  sortOrder: number
  notes: string | null
  activeSince: string | null
  activeUntil: string | null
  createdAt: string
  customFields?: CustomFieldDef[]
  thresholdOverrides?: ThresholdOverride[]
}

export interface MonthlySheet {
  id: string
  customerId: string
  customer?: { id: string; name: string }
  year: number
  month: number
  status: SheetStatus
  technicianName: string | null
  maintenanceDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  deviceRecords?: DeviceRecord[]
  _count?: { deviceRecords: number }
}

export interface DeviceRecord {
  id: string
  sheetId: string
  deviceId: string
  device: Device
  uptimeDays: number | null
  diskFreeGB: number | null
  eventlogsOk: boolean | null
  lastUpdateDate: string | null
  overallStatus: RecordStatus
  customValues: CustomFieldValue[]
  comments: Comment[]
  updatedAt: string
}

export interface CustomFieldDef {
  id: string
  categories: string | null // JSON array string: e.g. '["NAS","FIREWALL"]' | null = all
  /** @deprecated use categories */ category?: string | null
  name: string
  unit: string | null
  dataType: FieldDataType
  selectOptions: string | null // JSON string: string[]
  warnCondition: string | null // JSON string: { lt?: number; gt?: number; olderThanDays?: number }
  errorCondition: string | null // JSON string: same format, triggers ERROR instead of WARNING
  isRequired: boolean
  sortOrder: number
  isActive: boolean
}

export interface CustomFieldValue {
  id: string
  recordId: string
  fieldDefId: string
  fieldDef: CustomFieldDef
  value: string
  updatedAt: string
}

export interface Comment {
  id: string
  recordId: string
  text: string
  severity: CommentSeverity
  persistent: boolean
  resolved: boolean
  createdAt: string
  updatedAt: string
  record?: {
    device: {
      id: string
      name: string
      category: DeviceCategory
      hostname: string | null
    }
    sheet: {
      customer: {
        id: string
        name: string
      }
    }
  }
}

export interface GlobalThreshold {
  id: string
  field: string
  warnBelow: number | null
  warnAbove: number | null
  errorBelow: number | null
  errorAbove: number | null
  warnOlderThanDays: number | null
  errorOlderThanDays: number | null
}

export interface ThresholdOverride {
  id: string
  customerId: string | null
  deviceId: string | null
  field: string
  warnBelow: number | null
  warnAbove: number | null
  errorBelow: number | null
  errorAbove: number | null
  warnOlderThanDays: number | null
  errorOlderThanDays: number | null
}

// Helper: parse selectOptions JSON
export function parseSelectOptions(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) as string[] } catch { return [] }
}

// Helper: parse warnCondition JSON
export function parseWarnCondition(raw: string | null): Record<string, number> {
  if (!raw) return {}
  try { return JSON.parse(raw) as Record<string, number> } catch { return {} }
}
