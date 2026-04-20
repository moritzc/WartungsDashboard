import { prisma } from './prisma.js'

export type ThresholdValues = {
  warnBelow?: number | null
  warnAbove?: number | null
  errorBelow?: number | null
  errorAbove?: number | null
  warnOlderThanDays?: number | null
  errorOlderThanDays?: number | null
}

export type FieldStatus = 'OK' | 'WARNING' | 'ERROR'

// ─── Resolve effective threshold for a field ─────────────────────────────────
// Priority: device override > customer override > global default
export async function resolveThreshold(
  field: string,
  deviceId: string,
  customerId: string,
): Promise<ThresholdValues> {
  const [deviceOverride, customerOverride, globalDefault] = await Promise.all([
    prisma.thresholdOverride.findFirst({ where: { deviceId, field } }),
    prisma.thresholdOverride.findFirst({ where: { customerId, deviceId: null, field } }),
    prisma.globalThreshold.findUnique({ where: { field } }),
  ])

  return deviceOverride ?? customerOverride ?? globalDefault ?? {}
}

// ─── Evaluate a numeric value against a threshold ────────────────────────────
export function evaluateNumeric(value: number, thresholds: ThresholdValues): FieldStatus {
  const { errorBelow, errorAbove, warnBelow, warnAbove } = thresholds
  if (errorBelow != null && value < errorBelow) return 'ERROR'
  if (errorAbove != null && value > errorAbove) return 'ERROR'
  if (warnBelow != null && value < warnBelow) return 'WARNING'
  if (warnAbove != null && value > warnAbove) return 'WARNING'
  return 'OK'
}

// ─── Evaluate a date string (YYYY-MM-DD) against age thresholds ──────────────
// referenceDate: if provided, use this as "now" instead of Date.now() (for historical sheets)
export function evaluateDateAge(dateStr: string, thresholds: ThresholdValues, referenceDate?: Date): FieldStatus {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'OK'

  const refTime = referenceDate ? referenceDate.getTime() : Date.now()
  const ageMs = refTime - date.getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)

  const { errorOlderThanDays, warnOlderThanDays } = thresholds
  if (errorOlderThanDays != null && ageDays > errorOlderThanDays) return 'ERROR'
  if (warnOlderThanDays != null && ageDays > warnOlderThanDays) return 'WARNING'
  return 'OK'
}

// ─── Compute overall record status ───────────────────────────────────────────
export function mergeStatuses(statuses: FieldStatus[]): FieldStatus {
  if (statuses.includes('ERROR')) return 'ERROR'
  if (statuses.includes('WARNING')) return 'WARNING'
  return 'OK'
}

// ─── Full status computation for a DeviceRecord ──────────────────────────────
export async function computeRecordStatus(
  record: {
    id: string
    diskFreeGB: number | null
    lastUpdateDate: string | null
    eventlogsOk: boolean | null
    customValues: { value: string; fieldDef: { warnCondition: string | null; dataType: string } }[]
  },
  deviceId: string,
  customerId: string,
  referenceDate?: Date,
): Promise<FieldStatus> {
  const statuses: FieldStatus[] = []

  // diskFreeGB
  if (record.diskFreeGB != null) {
    const t = await resolveThreshold('diskFreeGB', deviceId, customerId)
    statuses.push(evaluateNumeric(record.diskFreeGB, t))
  }

  // lastUpdateDate
  if (record.lastUpdateDate) {
    const t = await resolveThreshold('lastUpdateDate', deviceId, customerId)
    statuses.push(evaluateDateAge(record.lastUpdateDate, t, referenceDate))
  }

  // eventlogs — if not OK, it's a warning (user should add a comment)
  if (record.eventlogsOk === false) {
    statuses.push('WARNING')
  }

  // Custom fields with warnCondition
  for (const cv of record.customValues) {
    if (!cv.fieldDef.warnCondition) continue
    try {
      const cond = JSON.parse(cv.fieldDef.warnCondition) as Record<string, number>
      if (cv.fieldDef.dataType === 'NUMBER') {
        const num = parseFloat(cv.value)
        if (!isNaN(num)) {
          const t: ThresholdValues = {
            warnBelow: cond['lt'],
            warnAbove: cond['gt'],
          }
          statuses.push(evaluateNumeric(num, t))
        }
      } else if (cv.fieldDef.dataType === 'DATE' && cond['olderThanDays']) {
        statuses.push(evaluateDateAge(cv.value, { warnOlderThanDays: cond['olderThanDays'] }, referenceDate))
      }
    } catch {
      // Invalid JSON in warnCondition — skip
    }
  }

  return mergeStatuses(statuses)
}
