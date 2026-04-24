import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/auth.js'

const sheetRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/sheets/:id — full sheet with all device records and custom values
  app.get('/:id', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }

    const sheet = await prisma.monthlySheet.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true } },
        deviceRecords: {
          include: {
            device: {
              include: {
                customFields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
                thresholdOverrides: true,
              },
            },
            customValues: {
              include: { fieldDef: true },
            },
            comments: {
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: [
            { device: { category: 'asc' } },
            { device: { sortOrder: 'asc' } },
            { device: { name: 'asc' } },
          ],
        },
      },
    })

    if (!sheet) return reply.status(404).send({ error: 'Sheet not found' })

    // Carry unresolved persistent comments from earlier sheets onto this month's records.
    if (sheet.deviceRecords.length > 0) {
      const carryOver = await prisma.comment.findMany({
        where: {
          persistent: true,
          resolved: false,
          record: {
            deviceId: { in: sheet.deviceRecords.map((r) => r.deviceId) },
            sheet: {
              customerId: sheet.customerId,
              OR: [
                { year: { lt: sheet.year } },
                { year: sheet.year, month: { lt: sheet.month } },
              ],
            },
          },
        },
        include: {
          record: {
            select: {
              deviceId: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })

      const commentsByDevice = new Map<string, typeof carryOver>()
      for (const c of carryOver) {
        const arr = commentsByDevice.get(c.record.deviceId) ?? []
        arr.push(c)
        commentsByDevice.set(c.record.deviceId, arr)
      }

      sheet.deviceRecords = sheet.deviceRecords.map((r) => {
        const inherited = commentsByDevice.get(r.deviceId) ?? []
        if (!inherited.length) return r
        const seen = new Set(r.comments.map((c) => c.id))
        const merged = [...r.comments, ...inherited.filter((c) => !seen.has(c.id))]
        return { ...r, comments: merged }
      })
    }

    return reply.send(sheet)
  })

  // PATCH /api/sheets/:id — update status/notes
  app.patch('/:id', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }
    const { status, notes, technicianName, maintenanceDate } = req.body as { 
      status?: string; 
      notes?: string;
      technicianName?: string | null;
      maintenanceDate?: string | null;
    }
    const data: Record<string, unknown> = {}
    if (status !== undefined) data.status = status
    if (notes !== undefined) data.notes = notes
    if (technicianName !== undefined) data.technicianName = technicianName
    if (maintenanceDate !== undefined) data.maintenanceDate = maintenanceDate
    const sheet = await prisma.monthlySheet.update({ where: { id }, data })
    return reply.send(sheet)
  })

  // DELETE /api/sheets/:id
  app.delete('/:id', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }
    await prisma.monthlySheet.delete({ where: { id } })
    return reply.send({ ok: true })
  })
}

export default sheetRoutes
