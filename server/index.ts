import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import staticPlugin from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'
import { prisma } from './lib/prisma.js'
import { PrismaSessionStore } from './lib/session-store.js'

// Routes
import authRoutes from './routes/auth.js'
import customerRoutes from './routes/customers.js'
import deviceRoutes from './routes/devices.js'
import sheetRoutes from './routes/sheets.js'
import recordRoutes from './routes/records.js'
import commentRoutes from './routes/comments.js'
import configRoutes from './routes/config.js'
import userRoutes from './routes/users.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT ?? '3067', 10)
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-in-production-please'
const IS_PROD = process.env.NODE_ENV === 'production'

declare module '@fastify/session' {
  interface FastifySessionObject {
    userId?: string
    userRole?: string
    username?: string
  }
}

async function main() {
  const app = Fastify({ logger: { level: IS_PROD ? 'warn' : 'info' } })

  // ── Plugins ────────────────────────────────────────────────────────────────
  await app.register(cookie)
  await app.register(session, {
    secret: SESSION_SECRET,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: new PrismaSessionStore() as any,
    cookie: {
      secure: false, // set to true if using HTTPS in production
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
    },
    saveUninitialized: false,
  })

  // ── API routes ─────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(customerRoutes, { prefix: '/api/customers' })
  await app.register(deviceRoutes, { prefix: '/api/devices' })
  await app.register(sheetRoutes, { prefix: '/api/sheets' })
  await app.register(recordRoutes, { prefix: '/api/records' })
  await app.register(commentRoutes, { prefix: '/api/comments' })
  await app.register(configRoutes, { prefix: '/api/config' })
  await app.register(userRoutes, { prefix: '/api/users' })

  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Serve React SPA (production) ───────────────────────────────────────────
  if (IS_PROD) {
    const clientDist = path.join(__dirname, '../client')
    await app.register(staticPlugin, {
      root: clientDist,
      prefix: '/',
      preCompressed: false,
    })

    // SPA fallback: serve index.html for all non-API routes
    app.setNotFoundHandler(async (req, reply) => {
      if (!req.url.startsWith('/api')) {
        return reply.sendFile('index.html', clientDist)
      }
      reply.status(404).send({ error: 'Not found' })
    })
  }

  // ── Seed default global thresholds if not present ─────────────────────────
  await seedDefaults()

  // ── Start server ──────────────────────────────────────────────────────────
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`✅ WartungsDashboard running on http://0.0.0.0:${PORT}`)
}

async function seedDefaults() {
  const defaults = [
    { field: 'diskFreeGB', warnBelow: 20, errorBelow: 10 },
    { field: 'lastUpdateDate', warnOlderThanDays: 40, errorOlderThanDays: 60 },
  ]

  for (const d of defaults) {
    await prisma.globalThreshold.upsert({
      where: { field: d.field },
      create: { ...d, updatedAt: new Date() },
      update: {}, // never overwrite once set
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
