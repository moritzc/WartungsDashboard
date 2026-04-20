/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from './prisma.js'

// Prisma-backed session store compatible with @fastify/session's store interface.
// We intentionally use `any` here at the interface boundary because @fastify/session
// declares its own opaque `Session` type that cannot be structurally satisfied
// by our plain object representation — but at runtime they are identical JSON objects.
export class PrismaSessionStore {
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    this.cleanupInterval = setInterval(() => void this.cleanup(), 15 * 60 * 1000)
    if (this.cleanupInterval.unref) this.cleanupInterval.unref()
  }

  get(sessionId: string, callback: (err: any, session?: any) => void): void {
    prisma.session
      .findUnique({ where: { id: sessionId } })
      .then((row) => {
        if (!row || row.expiresAt < new Date()) return callback(null, null)
        try {
          callback(null, JSON.parse(row.data))
        } catch {
          callback(null, null)
        }
      })
      .catch((err: unknown) => callback(err))
  }

  set(sessionId: string, session: any, callback: (err?: any) => void): void {
    const maxAge: number =
      typeof session?.cookie?.maxAge === 'number'
        ? session.cookie.maxAge
        : 7 * 24 * 60 * 60 * 1000
    const expiresAt = new Date(Date.now() + maxAge)

    prisma.session
      .upsert({
        where: { id: sessionId },
        create: { id: sessionId, data: JSON.stringify(session), expiresAt },
        update: { data: JSON.stringify(session), expiresAt },
      })
      .then(() => callback())
      .catch((err: unknown) => callback(err))
  }

  destroy(sessionId: string, callback: (err?: any) => void): void {
    prisma.session
      .deleteMany({ where: { id: sessionId } })
      .then(() => callback())
      .catch((err: unknown) => callback(err))
  }

  // express-session compatible
  touch(sessionId: string, session: any, callback: (err?: any) => void): void {
    this.set(sessionId, session, callback)
  }

  private async cleanup(): Promise<void> {
    try {
      await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    } catch {
      // Non-critical
    }
  }
}
