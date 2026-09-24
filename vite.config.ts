import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs keep the static build portable: it runs from the GitHub Pages
  // project path (`/gioco-burraco/`) and from the root of the local `vite preview`.
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    // Browser E2E specs run only through Playwright against the production build.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
