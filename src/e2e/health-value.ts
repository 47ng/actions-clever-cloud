import { randomBytes } from 'node:crypto'

export const HEALTH_VALUE_ENV_NAME = 'E2E_HEALTH_VALUE'

export function generateHealthValue(
  readRandomBytes: (size: number) => Uint8Array = randomBytes
): string {
  return Buffer.from(readRandomBytes(16)).toString('base64')
}

export function assertMatchingHealthValue({
  expectedValue,
  publicValue,
  remoteValue
}: {
  expectedValue: string
  publicValue: string | null
  remoteValue: string | null
}): void {
  if (publicValue !== expectedValue || remoteValue !== expectedValue) {
    throw new Error(
      'Expected the generated health value to match the deployed application exactly'
    )
  }
}
