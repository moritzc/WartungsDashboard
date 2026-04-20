import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/auth.js'

const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/users — admin only
  app.get('/', async (req, reply) => {
    requireAdmin(req, reply)
    const users = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
      orderBy: { username: 'asc' },
    })
    return reply.send(users)
  })

  // POST /api/users — admin only, create user
  app.post('/', async (req, reply) => {
    requireAdmin(req, reply)
    const { username, password, displayName, role } = req.body as {
      username: string
      password: string
      displayName?: string
      role?: string
    }

    if (!username || !password) {
      return reply.status(400).send({ error: 'username and password required' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    try {
      const user = await prisma.user.create({
        data: {
          username: username.trim().toLowerCase(),
          passwordHash,
          displayName: displayName?.trim() || null,
          role: role === 'ADMIN' ? 'ADMIN' : 'VIEWER',
        },
        select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
      })
      return reply.status(201).send(user)
    } catch {
      return reply.status(409).send({ error: 'Username already exists' })
    }
  })

  // PUT /api/users/:id — admin only
  app.put('/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    const { displayName, role, isActive, password } = req.body as {
      displayName?: string
      role?: string
      isActive?: boolean
      password?: string
    }

    const data: Record<string, unknown> = {}
    if (displayName !== undefined) data.displayName = displayName
    if (role !== undefined) data.role = role === 'ADMIN' ? 'ADMIN' : 'VIEWER'
    if (isActive !== undefined) data.isActive = isActive
    if (password) data.passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
    })
    return reply.send(user)
  })

  // DELETE /api/users/:id — admin only
  app.delete('/:id', async (req, reply) => {
    requireAdmin(req, reply)
    const { id } = req.params as { id: string }
    const { id: myId } = { id: req.session.userId! }
    if (id === myId) {
      return reply.status(400).send({ error: 'Cannot delete your own account' })
    }
    await prisma.user.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // PUT /api/users/me/password — change own password
  app.put('/me/password', async (req, reply) => {
    const userId = requireAuth(req, reply)
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'Not found' })

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return reply.status(401).send({ error: 'Current password incorrect' })

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    })
    return reply.send({ ok: true })
  })
}

export default userRoutes
