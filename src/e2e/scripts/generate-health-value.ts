import { appendFile } from 'node:fs/promises'
import { generateHealthValue, HEALTH_VALUE_ENV_NAME } from '../health-value.ts'

const githubOutput = process.env.GITHUB_OUTPUT

if (!githubOutput) {
  throw new Error('Missing GITHUB_OUTPUT for health value generation')
}

const value = generateHealthValue()
if (!value.endsWith('==')) {
  throw new Error('Generated health value must use 16-byte base64 padding')
}

await appendFile(
  githubOutput,
  `name=${HEALTH_VALUE_ENV_NAME}\nvalue=${value}\n`
)
