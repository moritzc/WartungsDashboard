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
