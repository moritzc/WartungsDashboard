import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/auth.js'

const deviceRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/devices/:id
  app.get('/:id', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }
    const device = await prisma.device.findUnique({
      where: { id },
      include: {
        customFields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        thresholdOverrides: true,
      },
    })
    if (!device) return reply.status(404).send({ error: 'Device not found' })
    return reply.send(device)
  })

  // POST /api/devices — create device under a customer
  app.post('/', async (req, reply) => {
    requireAdmin(req, reply)
    const { customerId, name, hostname, category, sortOrder, notes, customFieldIds } = req.body as {
      customerId: string
      name: string
      hostname?: string
      category?: string
      sortOrder?: number
      notes?: string
      customFieldIds?: string[]
    }
    if (!customerId || !name) return reply.status(400).send({ error: 'customerId and name required' })

    const device = await prisma.device.create({
      data: {
        customerId,
        name,
        hostname: hostname || null,
        category: category || 'SERVER',
        sortOrder: sortOrder ?? 0,
        notes: notes || null,
        customFields: customFieldIds ? {
          connect: customFieldIds.map((id: string) => ({ id })),
        } : undefined,
      },
    })
    return reply.status(201).send(device)
  })

  // PUT /api/devices/:id
  app.put('/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    const { name, hostname, category, sortOrder, notes, isActive, customFieldIds } = req.body as {
      name?: string
      hostname?: string
      category?: string
      sortOrder?: number
      notes?: string
      isActive?: boolean
      customFieldIds?: string[]
    }
    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (hostname !== undefined) data.hostname = hostname
    if (category !== undefined) data.category = category
    if (sortOrder !== undefined) data.sortOrder = sortOrder
    if (notes !== undefined) data.notes = notes
    if (isActive !== undefined) data.isActive = isActive
    if (customFieldIds !== undefined) {
      data.customFields = {
        set: customFieldIds.map((id: string) => ({ id })),
      }
    }

    const device = await prisma.device.update({ where: { id }, data })
    return reply.send(device)
  })

  // DELETE /api/devices/:id
  app.delete('/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    await prisma.device.delete({ where: { id } })
    return reply.send({ ok: true })
  })

}

export default deviceRoutes
