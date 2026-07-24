import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createApplicationWithRecovery,
  createCleverController
} from '../clever-client.ts'
import { createRunCommand, resolveCleverCLI } from '../workflow-adapters.ts'

const githubOutput = process.env.GITHUB_OUTPUT
const appName = process.env.APP_NAME
const appIdFile = process.env.APP_ID_FILE
const region = process.env.CLEVER_E2E_REGION || 'par'
const cleverCLI = resolveCleverCLI()

if (!githubOutput || !appName || !appIdFile) {
  throw new Error('Missing create-app workflow outputs')
}

await mkdir(path.dirname(appIdFile), {
  recursive: true
})

const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const application = await createApplicationWithRecovery(controller, {
  name: appName,
  region
})

try {
  await writeFile(appIdFile, JSON.stringify(application), 'utf8')
  await appendFile(
    githubOutput,
    `app_id=${application.appId}\n` + `app_name=${application.name}\n`
  )
} catch (error) {
  try {
    await controller.deleteApplication({
      appId: application.appId,
      name: application.name
    })
  } catch (rollbackError) {
    const rollbackMessage =
      rollbackError instanceof Error
        ? rollbackError.message
        : String(rollbackError)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${message}; rollback deletion of ${application.appId} (${application.name}) also failed: ${rollbackMessage}`,
      { cause: error }
    )
  }
  throw error
}
