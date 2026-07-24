import { writeFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import { createRunCommand, resolveCleverCLI } from '../workflow-adapters.ts'

const appId = process.env.APP_ID
const statePath = process.env.STATE_PATH
const instanceId = process.env.BASELINE_INSTANCE_ID
const deploymentId = process.env.BASELINE_DEPLOYMENT_ID
const commitId = process.env.BASELINE_COMMIT_ID
const baselineContext = process.env.BASELINE_CONTEXT
const cleverCLI = resolveCleverCLI()

if (!appId || !statePath || !instanceId || !deploymentId || !commitId) {
  throw new Error(`Missing ${baselineContext} baseline inputs`)
}

const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

await writeFile(
  statePath,
  JSON.stringify(
    {
      activity: await controller.listActivity(appId),
      instanceId,
      deploymentId,
      commitId
    },
    null,
    2
  ),
  'utf8'
)
