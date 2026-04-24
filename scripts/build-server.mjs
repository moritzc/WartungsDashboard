import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (!existsSync('server/index.ts') || !existsSync('tsconfig.server.json')) {
  console.log('ℹ️ Skipping server build: source files are not present in this container image.')
  process.exit(0)
}

const prismaGenerate = spawnSync('npx', ['prisma', 'generate'], { stdio: 'inherit', shell: true })
if ((prismaGenerate.status ?? 1) !== 0) process.exit(prismaGenerate.status ?? 1)

const result = spawnSync('npx', ['tsc', '-p', 'tsconfig.server.json'], { stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
