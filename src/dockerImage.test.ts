import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parse } from 'yaml'

const dockerfile = readFileSync(
  new URL('../Dockerfile', import.meta.url),
  'utf8'
)
const finalStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '))

const action = parse(
  readFileSync(new URL('../action.yml', import.meta.url), 'utf8')
) as { inputs: Record<string, { default?: string }> }

test('the final image can push over HTTPS with system git', () => {
  const aptInstall = finalStage.match(/apt-get install[^\n]*/)?.[0] ?? ''
  expect(aptInstall).toMatch(/\bgit\b/)
  expect(aptInstall).toMatch(/\bca-certificates\b/)
})

const booleanInputs = Object.entries(action.inputs).filter(
  ([, input]) => input.default === 'true' || input.default === 'false'
)

test('action.yml declares boolean inputs', () => {
  expect(booleanInputs.length).toBeGreaterThan(0)
})

test.each(booleanInputs)(
  'the image defaults the %s boolean input like action.yml',
  (name, input) => {
    expect(finalStage).toContain(
      `ENV INPUT_${name.toUpperCase()}=${input.default}`
    )
  }
)
