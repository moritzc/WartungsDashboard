import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/auth.js'

const commentRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/comments/record/:recordId
  app.get('/record/:recordId', async (req, reply) => {
    requireAuth(req, reply)
    const { recordId } = req.params as { recordId: string }
    const comments = await prisma.comment.findMany({
      where: { recordId },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(comments)
  })

  // POST /api/comments/record/:recordId
  app.post('/record/:recordId', async (req, reply) => {
    requireAuth(req, reply)
    const { recordId } = req.params as { recordId: string }
    const { text, severity } = req.body as { text: string; severity?: string }
    if (!text?.trim()) return reply.status(400).send({ error: 'text required' })

    const comment = await prisma.comment.create({
      data: {
        recordId,
        text: text.trim(),
        severity: (['INFO', 'WARNING', 'CRITICAL'].includes(severity ?? '') ? severity : 'INFO') as string,
      },
    })
    return reply.status(201).send(comment)
  })

  // PUT /api/comments/:id
  app.put('/:id', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }
    const { text, severity, resolved } = req.body as { text?: string; severity?: string; resolved?: boolean }
    const data: Record<string, unknown> = {}
    if (text !== undefined) data.text = text
    if (severity !== undefined) data.severity = severity
    if (resolved !== undefined) data.resolved = resolved

    const comment = await prisma.comment.update({ where: { id }, data })
    return reply.send(comment)
  })

  // DELETE /api/comments/:id
  app.delete('/:id', async (req, reply) => {
    requireAuth(req, reply)
    const { id } = req.params as { id: string }
    await prisma.comment.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // GET /api/comments/export — get all comments for reporting
  app.get('/export', async (req, reply) => {
    requireAuth(req, reply)
    const { sheetId, year, month, customerId, severity, resolved } = req.query as {
      sheetId?: string
      year?: string
      month?: string
      customerId?: string
      severity?: string
      resolved?: string
    }

    let where: Record<string, unknown> = {}
    if (sheetId) {
      where = { record: { sheetId } }
    } else if (year && month) {
      where = {
        record: {
          sheet: {
            year: Number(year),
            month: Number(month),
            ...(customerId && customerId !== 'ALL' ? { customerId } : {})
          }
        }
      }
    } else {
      return reply.status(400).send({ error: 'sheetId or year/month required' })
    }

    if (severity) where.severity = severity
    if (resolved !== undefined) where.resolved = resolved === 'true'

    const comments = await prisma.comment.findMany({
      where,
      include: {
        record: {
          include: {
            device: { select: { id: true, name: true, category: true, hostname: true } },
            sheet: { include: { customer: { select: { id: true, name: true } } } }
          },
        },
      },
      orderBy: [
        { record: { sheet: { customer: { name: 'asc' } } } },
        { record: { device: { category: 'asc' } } },
        { record: { device: { name: 'asc' } } },
        { severity: 'desc' },
        { createdAt: 'asc' },
      ],
    })
    return reply.send(comments)
  })
}

export default commentRoutes
