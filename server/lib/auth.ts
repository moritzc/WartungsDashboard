import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

// ─── Auth guard helper ────────────────────────────────────────────────────────
export function requireAuth(req: FastifyRequest, reply: FastifyReply): string {
  const userId = req.session.userId
  if (!userId) {
    reply.status(401).send({ error: 'Unauthorized' })
    throw new Error('Unauthorized')
  }
  return userId
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): void {
  requireAuth(req, reply)
  if (req.session.userRole !== 'ADMIN') {
    reply.status(403).send({ error: 'Forbidden — admin only' })
    throw new Error('Forbidden')
  }
}

// Re-export as a placeholder plugin (no-op; auth is done via helpers in each route)
const authPlugin: FastifyPluginAsync = async () => {}
export default authPlugin
