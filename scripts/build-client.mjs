import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (!existsSync('client/index.html')) {
  console.log('ℹ️ Skipping client build: client/index.html not found in this container image.')
  process.exit(0)
}

const result = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
