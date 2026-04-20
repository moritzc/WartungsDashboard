import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/auth.js'

const configRoutes: FastifyPluginAsync = async (app) => {
  // ── Global Thresholds ────────────────────────────────────────────────────────

  // GET /api/config/thresholds
  app.get('/thresholds', async (req, reply) => {
    requireAuth(req, reply)
    const thresholds = await prisma.globalThreshold.findMany()
    return reply.send(thresholds)
  })

  // PUT /api/config/thresholds/:field
  app.put('/thresholds/:field', async (req, reply) => {
    requireAdmin(req, reply)
    const { field } = req.params as { field: string }
    const { warnBelow, warnAbove, errorBelow, errorAbove, warnOlderThanDays, errorOlderThanDays } =
      req.body as {
        warnBelow?: number | null
        warnAbove?: number | null
        errorBelow?: number | null
        errorAbove?: number | null
        warnOlderThanDays?: number | null
        errorOlderThanDays?: number | null
      }

    const threshold = await prisma.globalThreshold.upsert({
      where: { field },
      create: {
        field,
        warnBelow: warnBelow ?? null,
        warnAbove: warnAbove ?? null,
        errorBelow: errorBelow ?? null,
        errorAbove: errorAbove ?? null,
        warnOlderThanDays: warnOlderThanDays ?? null,
        errorOlderThanDays: errorOlderThanDays ?? null,
        updatedAt: new Date(),
      },
      update: {
        warnBelow: warnBelow ?? null,
        warnAbove: warnAbove ?? null,
        errorBelow: errorBelow ?? null,
        errorAbove: errorAbove ?? null,
        warnOlderThanDays: warnOlderThanDays ?? null,
        errorOlderThanDays: errorOlderThanDays ?? null,
        updatedAt: new Date(),
      },
    })
    return reply.send(threshold)
  })

  // ── Threshold Overrides (per customer / per device) ──────────────────────────

  // GET /api/config/overrides?customerId=...&deviceId=...
  app.get('/overrides', async (req, reply) => {
    requireAuth(req, reply)
    const { customerId, deviceId } = req.query as { customerId?: string; deviceId?: string }
    const overrides = await prisma.thresholdOverride.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        ...(deviceId ? { deviceId } : {}),
      },
    })
    return reply.send(overrides)
  })

  // POST /api/config/overrides
  app.post('/overrides', async (req, reply) => {
    requireAdmin(req, reply)
    const body = req.body as {
      customerId?: string
      deviceId?: string
      field: string
      warnBelow?: number | null
      warnAbove?: number | null
      errorBelow?: number | null
      errorAbove?: number | null
      warnOlderThanDays?: number | null
      errorOlderThanDays?: number | null
    }
    const override = await prisma.thresholdOverride.create({
      data: { ...body, updatedAt: new Date() },
    })
    return reply.status(201).send(override)
  })

  // PUT /api/config/overrides/:id
  app.put('/overrides/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    const override = await prisma.thresholdOverride.update({
      where: { id },
      data: { ...body, updatedAt: new Date() },
    })
    return reply.send(override)
  })

  // DELETE /api/config/overrides/:id
  app.delete('/overrides/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    await prisma.thresholdOverride.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // ── Global Custom Fields (category-level, not device-specific) ───────────────

  // GET /api/config/custom-fields?category=...
  app.get('/custom-fields', async (req, reply) => {
    requireAuth(req, reply)
    const { category } = req.query as { category?: string }
    const fields = await prisma.customFieldDef.findMany({
      where: {
        ...(category ? { category } : {}),
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    })
    return reply.send(fields)
  })

  // POST /api/config/custom-fields
  app.post('/custom-fields', async (req, reply) => {
    requireAdmin(req, reply)
    const { category, name, unit, dataType, selectOptions, warnCondition, isRequired, sortOrder } =
      req.body as {
        category?: string
        name: string
        unit?: string
        dataType?: string
        selectOptions?: string[]
        warnCondition?: Record<string, number>
        isRequired?: boolean
        sortOrder?: number
      }
    if (!name) return reply.status(400).send({ error: 'name required' })

    const field = await prisma.customFieldDef.create({
      data: {
        category: category || null,
        name,
        unit: unit || null,
        dataType: dataType || 'TEXT',
        selectOptions: selectOptions ? JSON.stringify(selectOptions) : null,
        warnCondition: warnCondition ? JSON.stringify(warnCondition) : null,
        isRequired: isRequired ?? false,
        sortOrder: sortOrder ?? 0,
        updatedAt: new Date(),
      },
    })
    return reply.status(201).send(field)
  })

  // PUT /api/config/custom-fields/:id
  app.put('/custom-fields/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    const { name, unit, dataType, selectOptions, warnCondition, isRequired, sortOrder, isActive, category } =
      req.body as {
        name?: string
        unit?: string
        dataType?: string
        selectOptions?: string[]
        warnCondition?: Record<string, number> | null
        isRequired?: boolean
        sortOrder?: number
        isActive?: boolean
        category?: string
      }
    const data: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) data.name = name
    if (unit !== undefined) data.unit = unit
    if (dataType !== undefined) data.dataType = dataType
    if (selectOptions !== undefined) data.selectOptions = JSON.stringify(selectOptions)
    if (warnCondition !== undefined) data.warnCondition = warnCondition ? JSON.stringify(warnCondition) : null
    if (isRequired !== undefined) data.isRequired = isRequired
    if (sortOrder !== undefined) data.sortOrder = sortOrder
    if (isActive !== undefined) data.isActive = isActive
    if (category !== undefined) data.category = category

    const field = await prisma.customFieldDef.update({ where: { id }, data })
    return reply.send(field)
  })

  // DELETE /api/config/custom-fields/:id
  app.delete('/custom-fields/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    await prisma.customFieldDef.delete({ where: { id } })
    return reply.send({ ok: true })
  })
}

export default configRoutes
