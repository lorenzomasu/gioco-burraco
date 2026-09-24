import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    // Browser E2E specs run only through Playwright against the production build.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
