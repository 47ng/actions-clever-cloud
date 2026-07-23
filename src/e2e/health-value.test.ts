import { expect, test } from 'vitest'
import { assertMatchingHealthValue, generateHealthValue } from './health-value'

test('generates a 16-byte base64 health value with == padding', () => {
  const value = generateHealthValue(size => {
    expect(size).toBe(16)
    return Buffer.from('00112233445566778899aabbccddeeff', 'hex')
  })

  expect(value).toBe('ABEiM0RVZneImaq7zN3u/w==')
  expect(value.endsWith('==')).toBe(true)
})

test('requires the public and remote health values to match exactly without printing them', () => {
  expect(() =>
    assertMatchingHealthValue({
      expectedValue: 'ABEiM0RVZneImaq7zN3u/w==',
      publicValue: 'ABEiM0RVZneImaq7zN3u/w=',
      remoteValue: 'ABEiM0RVZneImaq7zN3u/w=='
    })
  ).toThrow('Expected the generated health value to match the deployed application exactly')

  expect(() =>
    assertMatchingHealthValue({
      expectedValue: 'ABEiM0RVZneImaq7zN3u/w==',
      publicValue: 'ABEiM0RVZneImaq7zN3u/w==',
      remoteValue: 'ABEiM0RVZneImaq7zN3u/w=='
    })
  ).not.toThrow()
})
