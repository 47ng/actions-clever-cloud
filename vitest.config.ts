import { defineConfig, type ViteUserConfig } from 'vitest/config'

const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'node',
    typecheck: {
      include: ['src/**/*.test.ts']
    }
  }
})

export default config
