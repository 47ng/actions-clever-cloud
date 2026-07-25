import { generateHealthValue, HEALTH_VALUE_ENV_NAME } from '../health-value.ts'
import { writeStepOutputs } from '../step-output.ts'

const githubOutput = process.env.GITHUB_OUTPUT

if (!githubOutput) {
  throw new Error('Missing GITHUB_OUTPUT for health value generation')
}

const value = generateHealthValue()
if (!value.endsWith('==')) {
  throw new Error('Generated health value must use 16-byte base64 padding')
}

await writeStepOutputs(githubOutput, {
  name: HEALTH_VALUE_ENV_NAME,
  value
})
