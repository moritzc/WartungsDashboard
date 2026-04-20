import { PrismaClient } from '@prisma/client'

// Prisma client singleton
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})
