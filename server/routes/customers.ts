import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/auth.js'

const customerRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/customers
  app.get('/', async (req, reply) => {
    requireAuth(req, reply)
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { devices: { where: { isActive: true } } } },
        monthlySheets: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 1,
          select: { id: true, year: true, month: true, status: true },
        },
      },
    })
    return reply.send(customers)
  })

  // GET /api/customers/:id
  app.get('/:id', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        devices: { 
          where: { isActive: true }, 
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
          include: { customFields: true }
        },
        monthlySheets: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 12 },
      },
    })
    if (!customer) return reply.status(404).send({ error: 'Customer not found' })
    return reply.send(customer)
  })

  // POST /api/customers
  app.post('/', async (req, reply) => {
    requireAdmin(req, reply)
    const { name, notes } = req.body as { name: string; notes?: string }
    if (!name) return reply.status(400).send({ error: 'name required' })

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const customer = await prisma.customer.create({ data: { name, slug, notes } })
    return reply.status(201).send(customer)
  })

  // PUT /api/customers/:id
  app.put('/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    const { name, notes, isActive } = req.body as { name?: string; notes?: string; isActive?: boolean }
    const data: Record<string, unknown> = {}
    if (name !== undefined) { data.name = name; data.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
    if (notes !== undefined) data.notes = notes
    if (isActive !== undefined) data.isActive = isActive
    const customer = await prisma.customer.update({ where: { id }, data })
    return reply.send(customer)
  })

  // DELETE /api/customers/:id
  app.delete('/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    await prisma.customer.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // GET /api/customers/:id/sheets  (list all sheets for a customer)
  app.get('/:id/sheets', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }
    const sheets = await prisma.monthlySheet.findMany({
      where: { customerId: id },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        _count: { select: { deviceRecords: true } },
        deviceRecords: {
          select: { overallStatus: true },
        },
      },
    })
    return reply.send(sheets)
  })

  // POST /api/customers/:id/sheets  (create or get existing sheet)
  app.post('/:id/sheets', async (req, reply) => {
    requireAuth(req, reply)
    const { id: customerId } = req.params as { id: string }
    const { year, month } = req.body as { year: number; month: number }

    if (!year || !month || month < 1 || month > 12) {
      return reply.status(400).send({ error: 'Valid year and month (1-12) required' })
    }

    // Upsert the sheet
    const sheet = await prisma.monthlySheet.upsert({
      where: { customerId_year_month: { customerId, year, month } },
      create: { customerId, year, month, status: 'DRAFT' },
      update: {},
    })

    // Ensure a DeviceRecord exists for every active device
    const devices = await prisma.device.findMany({
      where: { customerId, isActive: true },
    })

    for (const device of devices) {
      await prisma.deviceRecord.upsert({
        where: { sheetId_deviceId: { sheetId: sheet.id, deviceId: device.id } },
        create: { sheetId: sheet.id, deviceId: device.id },
        update: {},
      })
    }

    return reply.status(201).send(sheet)
  })
}

export default customerRoutes
