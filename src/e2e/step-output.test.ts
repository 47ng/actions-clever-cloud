import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { formatStepOutputs, writeStepOutputs } from './step-output.ts'

test('formats a single output as a delimited block', () => {
  expect(formatStepOutputs({ commit: 'abc123' }, () => 'DELIM')).toBe(
    'commit<<DELIM\nabc123\nDELIM\n'
  )
})

test('formats several outputs in order', () => {
  expect(formatStepOutputs({ a: '1', b: '2' }, () => 'DELIM')).toBe(
    'a<<DELIM\n1\nDELIM\nb<<DELIM\n2\nDELIM\n'
  )
})

test('treats null and undefined as an empty value', () => {
  expect(formatStepOutputs({ instance_id: null }, () => 'DELIM')).toBe(
    'instance_id<<DELIM\n\nDELIM\n'
  )
})

test('contains a value that spans lines without forging a second output', () => {
  const result = formatStepOutputs(
    { instance_id: 'real\nforged=true' },
    () => 'DELIM'
  )

  expect(result).toContain('real\nforged=true')

  const openingLines = result
    .split('\n')
    .filter(line => line === 'instance_id<<DELIM')

  expect(openingLines).toHaveLength(1)
})

test('rejects a value that contains the delimiter', () => {
  expect(() =>
    formatStepOutputs({ a: 'xDELIMx' }, () => 'DELIM')
  ).toThrow('collides with its own delimiter')
})

test('rejects an unsafe output name', () => {
  expect(() =>
    formatStepOutputs({ 'a=b': 'x' }, () => 'DELIM')
  ).toThrow('Unsafe step output name')
})

test('the default delimiter differs between calls', () => {
  const first = formatStepOutputs({ a: 'x' })
  const second = formatStepOutputs({ a: 'x' })

  expect(first).not.toBe(second)
})

test('writeStepOutputs appends rather than truncates', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'actions-clever-cloud-step-output-')
  )
  const githubOutputPath = path.join(directory, 'github-output')

  await writeStepOutputs(githubOutputPath, { a: '1' })
  await writeStepOutputs(githubOutputPath, { b: '2' })

  const contents = await readFile(githubOutputPath, 'utf-8')

  expect(contents).toContain('a<<')
  expect(contents).toContain('b<<')
})
