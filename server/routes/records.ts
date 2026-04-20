import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/auth.js'
import { computeRecordStatus } from '../lib/threshold.js'

type RecordPatch = {
  uptimeDays?: number | null
  diskFreeGB?: number | null
  eventlogsOk?: boolean | null
  lastUpdateDate?: string | null
  customValues?: Record<string, string> // fieldDefId -> value
}

type BatchPatch = {
  sheetId: string
  records: Array<{ recordId: string } & RecordPatch>
}

const recordRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/records/:id
  app.get('/:id', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }
    const record = await prisma.deviceRecord.findUnique({
      where: { id },
      include: {
        device: true,
        customValues: { include: { fieldDef: true } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!record) return reply.status(404).send({ error: 'Record not found' })
    return reply.send(record)
  })

  // PATCH /api/records/:id — update a single record
  app.patch('/:id', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }
    const patch = req.body as RecordPatch
    await applyPatch(id, patch)
    const record = await prisma.deviceRecord.findUnique({
      where: { id },
      include: { customValues: { include: { fieldDef: true } } },
    })
    return reply.send(record)
  })

  // POST /api/records/batch — save multiple records in one request
  app.post('/batch', async (req, reply) => {
    requireAuth(req, reply)
    const { records } = req.body as BatchPatch

    await Promise.all(records.map(({ recordId, ...patch }) => applyPatch(recordId, patch)))
    return reply.send({ ok: true, count: records.length })
  })
}

// ─── Shared patch logic ───────────────────────────────────────────────────────
async function applyPatch(id: string, patch: RecordPatch) {
  const { customValues, ...standardFields } = patch

  // Update standard fields
  const data: Record<string, unknown> = {}
  if ('uptimeDays' in standardFields) data.uptimeDays = standardFields.uptimeDays
  if ('diskFreeGB' in standardFields) data.diskFreeGB = standardFields.diskFreeGB
  if ('eventlogsOk' in standardFields) data.eventlogsOk = standardFields.eventlogsOk
  if ('lastUpdateDate' in standardFields) data.lastUpdateDate = standardFields.lastUpdateDate

  // Update custom field values
  if (customValues) {
    for (const [fieldDefId, value] of Object.entries(customValues)) {
      await prisma.customFieldValue.upsert({
        where: { recordId_fieldDefId: { recordId: id, fieldDefId } },
        create: { recordId: id, fieldDefId, value, updatedAt: new Date() },
        update: { value, updatedAt: new Date() },
      })
    }
  }

  // Recompute status
  const record = await prisma.deviceRecord.findUnique({
    where: { id },
    include: {
      device: { select: { id: true, customerId: true } },
      customValues: { include: { fieldDef: { select: { warnCondition: true, dataType: true } } } },
    },
  })

  if (record) {
    const mergedRecord = {
      ...record,
      ...data,
      diskFreeGB: ('diskFreeGB' in data ? data.diskFreeGB : record.diskFreeGB) as number | null,
      lastUpdateDate: ('lastUpdateDate' in data ? data.lastUpdateDate : record.lastUpdateDate) as string | null,
      eventlogsOk: ('eventlogsOk' in data ? data.eventlogsOk : record.eventlogsOk) as boolean | null,
    }
    const overallStatus = await computeRecordStatus(
      mergedRecord,
      record.device.id,
      record.device.customerId,
    )
    data.overallStatus = overallStatus
  }

  await prisma.deviceRecord.update({ where: { id }, data })
}

export default recordRoutes
