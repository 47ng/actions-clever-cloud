import { mkdir } from 'node:fs/promises'

const stateDir = process.env.E2E_STATE_DIR
const artifactsDir = process.env.E2E_ARTIFACTS_DIR

if (!stateDir || !artifactsDir) {
  throw new Error('Missing evidence directories')
}

await Promise.all([
  mkdir(stateDir, {
    recursive: true
  }),
  mkdir(artifactsDir, {
    recursive: true
  })
])
