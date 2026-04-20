import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'

const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/auth/login
  app.post('/login', async (req, reply) => {
    const { username, password } = req.body as { username: string; password: string }

    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password required' })
    }

    const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } })
    if (!user || !user.isActive) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    req.session.userId = user.id
    req.session.userRole = user.role
    req.session.username = user.username

    return reply.send({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    })
  })

  // POST /api/auth/logout
  app.post('/logout', async (req, reply) => {
    await req.session.destroy()
    return reply.send({ ok: true })
  })

  // GET /api/auth/me
  app.get('/me', async (req, reply) => {
    if (!req.session.userId) {
      return reply.status(401).send({ error: 'Not authenticated' })
    }
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, username: true, displayName: true, role: true },
    })
    if (!user) {
      await req.session.destroy()
      return reply.status(401).send({ error: 'User not found' })
    }
    return reply.send(user)
  })
}

export default authRoutes
