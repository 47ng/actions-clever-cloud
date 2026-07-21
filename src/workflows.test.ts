import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const mainWorkflow = readFileSync(
  new URL('../.github/workflows/main.yml', import.meta.url),
  'utf8'
)

test('does not interpolate github.ref_name in run scripts', () => {
  const unsafeLines: string[] = []
  let runBlockIndent: number | undefined

  for (const line of mainWorkflow.split('\n')) {
    const indent = line.length - line.trimStart().length

    if (
      runBlockIndent !== undefined &&
      line.trim() !== '' &&
      indent <= runBlockIndent
    ) {
      runBlockIndent = undefined
    }

    if (
      runBlockIndent !== undefined &&
      /\$\{\{\s*github\.ref_name\s*\}\}/.test(line)
    ) {
      unsafeLines.push(line.trim())
    }

    if (/^\s*run:\s*[|>]/.test(line)) {
      runBlockIndent = indent
    }
  }

  expect(unsafeLines).toEqual([])
})
