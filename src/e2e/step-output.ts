import { randomUUID } from 'node:crypto'
import { appendFile } from 'node:fs/promises'

type StepOutputs = Record<string, string | null | undefined>

export function formatStepOutputs(
  outputs: StepOutputs,
  createDelimiter: () => string = defaultDelimiter
): string {
  let formatted = ''

  for (const [name, value] of Object.entries(outputs)) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
      throw new Error(`Unsafe step output name: ${name}`)
    }

    const text = value ?? ''
    const delimiter = createDelimiter()

    if (text.includes(delimiter)) {
      throw new Error(`Step output ${name} collides with its own delimiter`)
    }

    formatted += `${name}<<${delimiter}\n${text}\n${delimiter}\n`
  }

  return formatted
}

export async function writeStepOutputs(
  githubOutputPath: string,
  outputs: StepOutputs
): Promise<void> {
  await appendFile(githubOutputPath, formatStepOutputs(outputs))
}

function defaultDelimiter(): string {
  return `__E2E_OUTPUT_${randomUUID()}__`
}
