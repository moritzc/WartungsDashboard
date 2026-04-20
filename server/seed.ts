// Run with: npm run db:seed
// Creates the initial admin user. Run once after first migration.
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seed() {
  const ADMIN_USER = process.env.ADMIN_USER ?? 'admin'
  const ADMIN_PASS = process.env.ADMIN_PASS ?? 'changeme123'

  const existing = await prisma.user.findUnique({ where: { username: ADMIN_USER } })
  if (existing) {
    console.log(`ℹ️  Admin user "${ADMIN_USER}" already exists.`)
  } else {
    await prisma.user.create({
      data: {
        username: ADMIN_USER,
        passwordHash: await bcrypt.hash(ADMIN_PASS, 12),
        displayName: 'Administrator',
        role: 'ADMIN',
      },
    })
    console.log(`✅ Admin user "${ADMIN_USER}" created. Default password: ${ADMIN_PASS}`)
    console.log('⚠️  Please change the password after first login!')
  }

  // Default global thresholds
  const defaults = [
    { field: 'diskFreeGB', warnBelow: 20, errorBelow: 10 },
    { field: 'lastUpdateDate', warnOlderThanDays: 40, errorOlderThanDays: 60 },
  ]
  for (const d of defaults) {
    await prisma.globalThreshold.upsert({
      where: { field: d.field },
      create: { ...d, updatedAt: new Date() },
      update: {},
    })
  }
  console.log('✅ Default thresholds seeded.')

  await prisma.$disconnect()
}

seed().catch((e) => { console.error(e); process.exit(1) })
